import Foundation
func check(_ ok: Bool, _ what: String) { print((ok ? "PASS " : "FAIL ") + what); if !ok { exit(1) } }
check(GitHubAccount.oneTimeCode(in: "! First copy your one-time code: A1B2-C3D4\nOpen this URL to continue in your web browser: https://github.com/login/device") == "A1B2-C3D4", "the one-time code is read out of gh's message")
check(GitHubAccount.oneTimeCode(in: "Logging in... nothing here") == nil, "no code when there is none")
check(GitHubAccount.validRepo("JackF-22/notival") && GitHubAccount.validRepo("a/b.c_d-e"), "real repository names are accepted")
check(!GitHubAccount.validRepo("../etc") && !GitHubAccount.validRepo("a/b;rm -rf") && !GitHubAccount.validRepo("a/../b") && !GitHubAccount.validRepo("no-slash") && !GitHubAccount.validRepo("a/b c"), "anything else is refused")
let st = GitHubAccount.status()
print("status:", st)
check((st["available"] as? Bool) == true, "gh is found")
if let login = st["login"] as? String {
 check(!login.isEmpty, "signed in as \(login)")
 let repos = GitHubAccount.repos()
 check(!repos.isEmpty, "lists the account's repositories (\(repos.count))")
 check(repos.contains { ($0["name"] as? String) == "JackF-22/notival" }, "including this one")
 let tmp = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true); try? FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
 let r = GitHubAccount.clone("JackF-22/notival", into: tmp)
 check(r.0 != nil && FileManager.default.fileExists(atPath: tmp.path + "/notival/.git"), "clones a repository once (\(r.1))")
 check(GitHubAccount.knownClone(of: "JackF-22/notival")?.path == r.0?.path, "and remembers where")
 UserDefaults.standard.removeObject(forKey: "notival.githubClones")
 let again = GitHubAccount.clone("JackF-22/notival", into: tmp)
 check(again.0 != nil, "an existing copy is reused, not cloned again")
 UserDefaults.standard.removeObject(forKey: "notival.githubClones")
}
