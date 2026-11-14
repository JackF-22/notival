import Foundation
func check(_ ok: Bool, _ what: String) { print((ok ? "PASS " : "FAIL ") + what); if !ok { exit(1) } }
func sh(_ args: [String], _ dir: String) { let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/git"); p.arguments = args; p.currentDirectoryURL = URL(fileURLWithPath: dir); p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice; try! p.run(); p.waitUntilExit() }
let root = CommandLine.arguments[1]
let bare = root + "/remote.git", work = root + "/work", loose = root + "/loose"
for d in [bare, work, loose] { try! FileManager.default.createDirectory(atPath: d, withIntermediateDirectories: true) }
sh(["init", "--bare", "-b", "main"], bare)
sh(["init", "-b", "main"], work); sh(["config", "user.email", "t@example.com"], work); sh(["config", "user.name", "T"], work)
sh(["remote", "add", "origin", bare], work)
let md = URL(fileURLWithPath: work + "/README.md")
// not a repo
let outside = URL(fileURLWithPath: loose + "/n.md"); try! "x".write(to: outside, atomically: true, encoding: .utf8)
check((GitPush.status(of: outside, imagesDir: "images", images: [])["repo"] as? Bool) == false, "a folder that isn't a repository is reported")
check(!GitPush.publish(outside, imagesDir: "images", images: [], message: "m").ok, "and refuses to push")
// first push: new file + a picture, no upstream yet
try! "# Hi\n".write(to: md, atomically: true, encoding: .utf8)
try! FileManager.default.createDirectory(atPath: work + "/images", withIntermediateDirectories: true)
try! Data([1,2,3]).write(to: URL(fileURLWithPath: work + "/images/shot-1.png"))
try! "other".write(to: URL(fileURLWithPath: work + "/unrelated.txt"), atomically: true, encoding: .utf8)
sh(["add", "unrelated.txt"], work)   // staged by the person, must not be swept into the note's commit
let st = GitPush.status(of: md, imagesDir: "images", images: ["shot-1.png", "../evil"])
check((st["repo"] as? Bool) == true && (st["branch"] as? String) == "main" && (st["changed"] as? Bool) == true && (st["remote"] as? String) == bare, "status: repo, branch, remote, changed")
let r1 = GitPush.publish(md, imagesDir: "images", images: ["shot-1.png", "../evil"], message: "Add notes")
check(r1.ok, "first push works (\(r1.output))")
func out(_ args: [String], _ dir: String) -> String { let p = Process(), pipe = Pipe(); p.executableURL = URL(fileURLWithPath: "/usr/bin/git"); p.arguments = args; p.currentDirectoryURL = URL(fileURLWithPath: dir); p.standardOutput = pipe; try! p.run(); let d = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit(); return String(data: d, encoding: .utf8)!.trimmingCharacters(in: .whitespacesAndNewlines) }
check(out(["log", "--format=%s", "-1"], bare) == "Add notes", "the remote has the commit")
check(out(["ls-tree", "-r", "--name-only", "main"], bare).split(separator: "\n").sorted() == ["README.md", "images/shot-1.png"], "only the note's own files were committed")
check(out(["diff", "--cached", "--name-only"], work) == "unrelated.txt", "something else the person had staged stays staged")
// nothing new: still ok
let r2 = GitPush.publish(md, imagesDir: "images", images: [], message: "")
check(r2.ok && r2.output.contains("Nothing new"), "nothing new to commit is fine (\(r2.output))")
// edit, default message
try! "# Hi again\n".write(to: md, atomically: true, encoding: .utf8)
check((GitPush.status(of: md, imagesDir: "images", images: [])["changed"] as? Bool) == true, "an edit shows as changed")
let r3 = GitPush.publish(md, imagesDir: "images", images: [], message: "  ")
check(r3.ok && out(["log", "--format=%s", "-1"], bare) == "Update README.md", "a blank message gets a sensible default")
// rejected push: someone else pushed first
let other = root + "/other"; sh(["clone", "-q", bare, other], root); sh(["config", "user.email", "o@example.com"], other); sh(["config", "user.name", "O"], other)
try! "theirs\n".write(to: URL(fileURLWithPath: other + "/README.md"), atomically: true, encoding: .utf8); sh(["commit", "-qam", "theirs"], other); sh(["push", "-q"], other)
try! "# Mine\n".write(to: md, atomically: true, encoding: .utf8)
let r4 = GitPush.publish(md, imagesDir: "images", images: [], message: "mine")
check(!r4.ok && r4.output.contains("newer work"), "a rejected push explains it and does not force (\(r4.output))")
check(out(["log", "--format=%s", "-1"], bare) == "theirs", "the remote is untouched")
