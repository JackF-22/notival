import Foundation

// Linking a GitHub account: Notival uses GitHub's own command-line tool (`gh`), so signing in happens on github.com in the
// browser and the credentials live in the Mac's keychain, never in Notival. The tool also gives git its sign-in for pushes.
enum GitHubAccount {
 static var ghPath: String? {
  ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"].first { FileManager.default.isExecutableFile(atPath: $0) }
 }
 private static var home: URL { FileManager.default.homeDirectoryForCurrentUser }

 // {available, login?}
 static func status() -> [String: Any] {
  guard let gh = ghPath else { return ["available": false] }
  let who = GitPush.exec(gh, ["api", "user", "--jq", ".login"], in: home, timeout: 20)
  let login = who.output.trimmingCharacters(in: .whitespacesAndNewlines)
  if who.status == 0, login.range(of: "^[A-Za-z0-9][A-Za-z0-9-]{0,38}$", options: .regularExpression) != nil { return ["available": true, "login": login] }
  return ["available": true]
 }

 // The repositories the account can push to, most recently pushed first.
 static func repos() -> [[String: Any]] {
  guard let gh = ghPath else { return [] }
  let r = GitPush.exec(gh, ["repo", "list", "--limit", "100", "--json", "nameWithOwner,isPrivate,description,pushedAt"], in: home, timeout: 30)
  guard r.status == 0, let data = r.output.data(using: .utf8), let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
  return list.compactMap { item in
   guard let name = item["nameWithOwner"] as? String, validRepo(name) else { return nil }
   return ["name": name, "private": item["isPrivate"] as? Bool ?? false, "description": item["description"] as? String ?? "", "pushedAt": item["pushedAt"] as? String ?? ""]
  }.sorted { ($0["pushedAt"] as? String ?? "") > ($1["pushedAt"] as? String ?? "") }
 }

 static func validRepo(_ name: String) -> Bool {
  name.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}/[A-Za-z0-9._-]{1,100}$"#, options: .regularExpression) != nil && !name.contains("..")
 }

 // gh prints "one-time code: ABCD-1234" while it waits for the browser sign-in.
 static func oneTimeCode(in text: String) -> String? {
  guard let range = text.range(of: #"\b[A-Z0-9]{4}-[A-Z0-9]{4}\b"#, options: .regularExpression) else { return nil }
  return String(text[range])
 }

 private static var login: Process?
 // Starts the browser sign-in. `code` is called with the one-time code to type on github.com, `done` when gh has finished.
 static func signIn(code: @escaping (String) -> Void, done: @escaping () -> Void) {
  guard let gh = ghPath else { done(); return }
  login?.terminate()
  let process = Process(), pipe = Pipe(), input = Pipe()
  process.executableURL = URL(fileURLWithPath: gh)
  process.arguments = ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--skip-ssh-key"]
  process.currentDirectoryURL = home
  var env = ProcessInfo.processInfo.environment
  env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + (env["PATH"] ?? ""); env["GH_PROMPT_DISABLED"] = "1"
  process.environment = env
  process.standardOutput = pipe; process.standardError = pipe; process.standardInput = input
  var text = "", sent = false
  pipe.fileHandleForReading.readabilityHandler = { h in
   let d = h.availableData; guard !d.isEmpty, let chunk = String(data: d, encoding: .utf8) else { return }
   text += chunk
   if !sent, let c = oneTimeCode(in: text) { sent = true; code(c) }
  }
  process.terminationHandler = { _ in pipe.fileHandleForReading.readabilityHandler = nil; done() }
  do { try process.run(); login = process } catch { done(); return }
  input.fileHandleForWriting.write(Data("\n".utf8))   // "Press Enter to open github.com in your browser"
  DispatchQueue.global().asyncAfter(deadline: .now() + 600) { if process.isRunning { process.terminate() } }
 }

 // A copy of the repository on this Mac, cloned once and remembered, so notes can be saved straight into it.
 private static let clonesKey = "notival.githubClones"
 static func knownClone(of repo: String) -> URL? {
  guard let path = (UserDefaults.standard.dictionary(forKey: clonesKey) as? [String: String])?[repo], FileManager.default.fileExists(atPath: path + "/.git") else { return nil }
  return URL(fileURLWithPath: path)
 }
 static func clone(_ repo: String, into parent: URL) -> (URL?, String) {
  guard let gh = ghPath, validRepo(repo) else { return (nil, "That repository name isn't valid.") }
  let target = parent.appendingPathComponent(String(repo.split(separator: "/").last ?? ""), isDirectory: true)
  if !FileManager.default.fileExists(atPath: target.path + "/.git") {
   let r = GitPush.exec(gh, ["repo", "clone", repo, target.path], in: parent, timeout: 180)
   guard r.status == 0 else { return (nil, String(r.output.suffix(300))) }
  }
  var map = (UserDefaults.standard.dictionary(forKey: clonesKey) as? [String: String]) ?? [:]
  map[repo] = target.path; UserDefaults.standard.set(map, forKey: clonesKey)
  return (target, "")
 }
}
