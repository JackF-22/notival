import Foundation

// Commit and push a linked Markdown file (and its pictures) with the Mac's own git, so it uses whatever sign-in git
// already has (the keychain, `gh auth`, or an SSH key). Nothing is ever forced, only the note's own files are committed,
// and git is never asked to prompt, so a missing sign-in is an error message rather than a hang.
enum GitPush {
 struct Result { var ok: Bool; var output: String }

 private static func git(_ args: [String], in directory: URL, timeout: TimeInterval = 60) -> (status: Int32, output: String) {
  exec("/usr/bin/git", args, in: directory, timeout: timeout)
 }
 // Runs a command-line tool with the sign-in git and gh already have, never prompting, and gives up after `timeout`.
 static func exec(_ path: String, _ args: [String], in directory: URL, timeout: TimeInterval = 60) -> (status: Int32, output: String) {
  let process = Process(), pipe = Pipe()
  process.executableURL = URL(fileURLWithPath: path)
  process.arguments = args
  process.currentDirectoryURL = directory
  var env = ProcessInfo.processInfo.environment
  env["GIT_TERMINAL_PROMPT"] = "0"; env["GIT_ASKPASS"] = "/usr/bin/true"; env["LC_ALL"] = "en_US.UTF-8"
  env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + (env["PATH"] ?? "")
  process.environment = env
  process.standardOutput = pipe; process.standardError = pipe
  var data = Data(); let lock = NSLock()
  pipe.fileHandleForReading.readabilityHandler = { h in let d = h.availableData; lock.lock(); data.append(d); lock.unlock() }
  do { try process.run() } catch { return (-1, error.localizedDescription) }
  let deadline = Date().addingTimeInterval(timeout)
  while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.03) }
  let timedOut = process.isRunning
  if timedOut { process.terminate() }
  process.waitUntilExit()
  pipe.fileHandleForReading.readabilityHandler = nil
  lock.lock(); let text = String(data: data, encoding: .utf8) ?? ""; lock.unlock()
  return (timedOut ? -2 : process.terminationStatus, timedOut ? "That took too long. Check your connection and sign-in, then try again." : text.trimmingCharacters(in: .whitespacesAndNewlines))
 }

 // The files this note owns, relative to the Markdown file's folder: itself and each named picture that exists.
 static func owned(_ url: URL, imagesDir: String, images: [String]) -> [String] {
  var list = [url.lastPathComponent]
  guard let folder = MarkdownFiles.safeName(imagesDir) else { return list }
  for name in images {
   guard let safe = MarkdownFiles.safeName(name) else { continue }
   if FileManager.default.fileExists(atPath: url.deletingLastPathComponent().appendingPathComponent(folder).appendingPathComponent(safe).path) { list.append(folder + "/" + safe) }
  }
  return list
 }

 // Where the file lives: the repository, branch and remote, and whether it has anything new to commit.
 static func status(of url: URL, imagesDir: String, images: [String]) -> [String: Any] {
  let dir = url.deletingLastPathComponent()
  let top = git(["rev-parse", "--show-toplevel"], in: dir, timeout: 10)
  guard top.status == 0 else { return ["repo": false] }
  let b = git(["symbolic-ref", "--short", "-q", "HEAD"], in: dir, timeout: 10)
  let branch = b.status == 0 ? b.output : ""
  let remote = git(["remote", "get-url", "origin"], in: dir, timeout: 10)
  let changes = git(["status", "--porcelain", "--"] + owned(url, imagesDir: imagesDir, images: images), in: dir, timeout: 15)
  var info: [String: Any] = ["repo": true, "root": top.output, "branch": branch, "changed": !changes.output.isEmpty]
  if remote.status == 0 { info["remote"] = remote.output.replacingOccurrences(of: #"://[^@/]*@"#, with: "://", options: .regularExpression) }
  return info
 }

 static func publish(_ url: URL, imagesDir: String, images: [String], message: String) -> Result {
  let dir = url.deletingLastPathComponent()
  let top = git(["rev-parse", "--show-toplevel"], in: dir, timeout: 10)
  guard top.status == 0 else { return Result(ok: false, output: "This file isn't in a git folder yet. Run git init (or clone your repository) there first.") }
  let b = git(["symbolic-ref", "--short", "-q", "HEAD"], in: dir, timeout: 10)
  let branch = b.status == 0 ? b.output : ""
  guard !branch.isEmpty else { return Result(ok: false, output: "Git isn't on a branch. Check one out first.") }
  guard git(["remote", "get-url", "origin"], in: dir, timeout: 10).status == 0 else { return Result(ok: false, output: "This repository has no GitHub remote called origin. Add one with: git remote add origin <url>") }
  let files = owned(url, imagesDir: imagesDir, images: images)
  let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
  var steps: [String] = []
  let add = git(["add", "--"] + files, in: dir)
  guard add.status == 0 else { return Result(ok: false, output: add.output) }
  let pending = git(["diff", "--cached", "--quiet", "--"] + files, in: dir, timeout: 15).status != 0
  if pending {
   let commit = git(["commit", "-m", text.isEmpty ? "Update " + url.lastPathComponent : text, "--"] + files, in: dir)
   guard commit.status == 0 else { return Result(ok: false, output: commit.output) }
   steps.append("Committed")
  } else { steps.append("Nothing new to commit") }
  let upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], in: dir, timeout: 10).status == 0
  let push = upstream ? git(["push"], in: dir) : git(["push", "-u", "origin", "HEAD"], in: dir)
  guard push.status == 0 else { return Result(ok: false, output: friendly(push.output)) }
  steps.append("pushed to " + branch)
  return Result(ok: true, output: steps.joined(separator: " and "))
 }

 private static func friendly(_ output: String) -> String {
  let lower = output.lowercased()
  if lower.contains("could not read username") || lower.contains("authentication failed") || lower.contains("permission denied") || lower.contains("terminal prompts disabled") {
   return "GitHub didn't accept the sign-in. In Terminal run `gh auth login` (or set up an SSH key), then try again."
  }
  if lower.contains("non-fast-forward") || lower.contains("rejected") || lower.contains("fetch first") {
   return "GitHub has newer work on this branch. Pull it in Terminal first (git pull), then push again."
  }
  return output.isEmpty ? "The push didn't go through." : String(output.suffix(400))
 }
}
