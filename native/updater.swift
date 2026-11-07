import Cocoa

// Keeping Notival current. Asks GitHub for the latest release; if it is newer, the page offers it, and installing
// downloads the zip, checks it is really Notival, swaps the app on disk once this copy has quit, and reopens it.
// Files the app downloads itself are not quarantined, so macOS doesn't ask again after the first install.
// NOTIVAL_UPDATE_FEED points the check somewhere else (for testing); NOTIVAL_UPDATE_AUTOINSTALL=1 installs without asking.
final class Updater {
 static let feed = URL(string: ProcessInfo.processInfo.environment["NOTIVAL_UPDATE_FEED"] ?? "https://api.github.com/repos/JackF-22/notival/releases/latest")!
 static let bundleID = Bundle.main.bundleIdentifier ?? "local.margin.desktop"
 static var current: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0" }

 struct Release { let version: String; let download: URL; let page: URL?; let notes: String }
 private(set) var latest: Release?
 private var installing = false
 private let tell: (String, Any) -> Void          // calls a function in the page with one JSON value
 init(tell: @escaping (String, Any) -> Void) { self.tell = tell }

 // "1.10.0" is newer than "1.9.2"; a leading v and anything after a dash are ignored.
 static func isNewer(_ a: String, than b: String) -> Bool {
  func parts(_ text: String) -> [Int] {
   let core = text.trimmingCharacters(in: CharacterSet(charactersIn: "vV ")).split(separator: "-").first.map(String.init) ?? ""
   return core.split(separator: ".").map { Int($0) ?? 0 }
  }
  let x = parts(a), y = parts(b)
  for index in 0..<max(x.count, y.count) {
   let p = index < x.count ? x[index] : 0, q = index < y.count ? y[index] : 0
   if p != q { return p > q }
  }
  return false
 }

 // manual: from the menu, so it always answers ("you're up to date"); otherwise it only speaks up when there is news.
 func check(manual: Bool = false) {
  var request = URLRequest(url: Updater.feed, timeoutInterval: 20)
  request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
  URLSession.shared.dataTask(with: request) { data, _, _ in
   DispatchQueue.main.async {
    guard let data, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let tag = json["tag_name"] as? String,
          let assets = json["assets"] as? [[String: Any]],
          let asset = assets.first(where: { ($0["name"] as? String)?.lowercased().hasSuffix(".zip") == true }),
          let link = asset["browser_download_url"] as? String, let download = URL(string: link) else {
     if manual { self.alert("Couldn't check for updates", "Check your internet connection and try again.") }
     return
    }
    let version = tag.trimmingCharacters(in: CharacterSet(charactersIn: "vV "))
    guard Updater.isNewer(version, than: Updater.current) else {
     if manual { self.alert("Notival is up to date", "You have version \(Updater.current), the newest one.") }
     return
    }
    let release = Release(version: version, download: download, page: (json["html_url"] as? String).flatMap(URL.init(string:)), notes: json["body"] as? String ?? "")
    self.latest = release
    if ProcessInfo.processInfo.environment["NOTIVAL_UPDATE_AUTOINSTALL"] == "1" { self.install(); return }
    if manual {
     let ask = NSAlert(); ask.messageText = "Notival \(version) is available"; ask.informativeText = "You have \(Updater.current). " + String(release.notes.prefix(600))
     ask.addButton(withTitle: "Update and Restart"); ask.addButton(withTitle: "Later")
     if ask.runModal() == .alertFirstButtonReturn { self.install() }
    } else {
     self.tell("window.notivalUpdateAvailable", ["version": version, "current": Updater.current, "notes": String(release.notes.prefix(1500))])
    }
   }
  }.resume()
 }

 // Download, check, and hand over to a small script that swaps the app once this copy has quit.
 func install() {
  guard let release = latest, !installing else { return }
  installing = true
  tell("window.notivalUpdateProgress", "Downloading Notival \(release.version)…")
  URLSession.shared.downloadTask(with: release.download) { file, _, error in
   let fail: (String) -> Void = { message in DispatchQueue.main.async { self.installing = false; self.tell("window.notivalUpdateFailed", message) } }
   guard let file, error == nil else { return fail("The download didn't finish. Try again in a moment.") }
   let fm = FileManager.default
   let work = fm.temporaryDirectory.appendingPathComponent("notival-update-\(UUID().uuidString)", isDirectory: true)
   do {
    try fm.createDirectory(at: work, withIntermediateDirectories: true)
    let zip = work.appendingPathComponent("Notival.zip"); try fm.moveItem(at: file, to: zip)
    guard Updater.run("/usr/bin/ditto", ["-x", "-k", zip.path, work.appendingPathComponent("unpacked").path]) == 0 else { return fail("The download couldn't be opened.") }
    guard let fresh = fm.enumerator(at: work.appendingPathComponent("unpacked"), includingPropertiesForKeys: nil)?.compactMap({ $0 as? URL }).first(where: { $0.pathExtension == "app" }),
          let info = NSDictionary(contentsOf: fresh.appendingPathComponent("Contents/Info.plist")),
          info["CFBundleIdentifier"] as? String == Updater.bundleID,
          let version = info["CFBundleShortVersionString"] as? String, !Updater.isNewer(release.version, than: version) else { return fail("The download wasn't a Notival update, so nothing was changed.") }
    guard Updater.run("/usr/bin/codesign", ["--verify", "--deep", fresh.path]) == 0 else { return fail("The update didn't pass its signature check, so nothing was changed.") }
    let target = URL(fileURLWithPath: Bundle.main.bundlePath)
    guard fm.isWritableFile(atPath: target.deletingLastPathComponent().path) else {
     DispatchQueue.main.async { self.installing = false; self.tell("window.notivalUpdateFailed", "Notival can't replace itself in \(target.deletingLastPathComponent().path). Download the new version and drag it into Applications."); if let page = release.page { NSWorkspace.shared.open(page) } }
     return
    }
    // Wait for this copy to quit, swap in the new one (putting the old one back if anything fails), and reopen.
    let script = work.appendingPathComponent("swap.sh")
    try """
    #!/bin/sh
    while kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do sleep 0.2; done
    rm -rf "$1.previous"
    if mv "$1" "$1.previous" && mv "$2" "$1"; then rm -rf "$1.previous"; else [ -d "$1.previous" ] && [ ! -d "$1" ] && mv "$1.previous" "$1"; fi
    open "$1"
    """.write(to: script, atomically: true, encoding: .utf8)
    let swap = Process(); swap.executableURL = URL(fileURLWithPath: "/bin/sh"); swap.arguments = [script.path, target.path, fresh.path]
    try swap.run()
    DispatchQueue.main.async {
     self.tell("window.notivalUpdateProgress", "Restarting into Notival \(release.version)…")
     // a moment for any last save in the page to reach the disk
     DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { NSApp.terminate(nil) }
    }
   } catch { fail("The update couldn't be prepared: \(error.localizedDescription)") }
  }.resume()
 }

 func openReleasePage() { if let page = latest?.page { NSWorkspace.shared.open(page) } else { NSWorkspace.shared.open(URL(string: "https://github.com/JackF-22/notival/releases/latest")!) } }

 @discardableResult static func run(_ tool: String, _ arguments: [String]) -> Int32 {
  let process = Process(); process.executableURL = URL(fileURLWithPath: tool); process.arguments = arguments
  process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
  do { try process.run(); process.waitUntilExit(); return process.terminationStatus } catch { return -1 }
 }

 private func alert(_ title: String, _ text: String) { let box = NSAlert(); box.messageText = title; box.informativeText = text; box.runModal() }
}
