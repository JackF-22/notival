import Foundation

// Markdown for GitHub: a note's Markdown saved as a file in a project, with its pictures in a folder beside it. A file can
// be written again later only if it was chosen in a save panel, so a note can never be pointed at some other file.
enum MarkdownFiles {
 private static let key = "notival.markdownGrants"

 static func grant(_ url: URL) {
  var list = UserDefaults.standard.stringArray(forKey: key) ?? []
  let path = url.standardizedFileURL.path
  if !list.contains(path) { list.append(path); UserDefaults.standard.set(Array(list.suffix(300)), forKey: key) }
 }
 static func isGranted(_ path: String) -> Bool {
  (UserDefaults.standard.stringArray(forKey: key) ?? []).contains(URL(fileURLWithPath: path).standardizedFileURL.path)
 }
 // Plain letters, digits, dot, dash and underscore only, so a name can't climb out of its folder.
 static func safeName(_ name: String) -> String? {
  guard !name.contains(".."), name.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$", options: .regularExpression) != nil else { return nil }
  return name
 }
 // Writes the Markdown, then each picture to <folder of the .md>/<imagesDir>/. Returns how many pictures are in place.
 @discardableResult
 static func write(text: String, images: [[String: Any]], to url: URL, imagesDir: String) throws -> Int {
  try text.write(to: url, atomically: true, encoding: .utf8)
  guard !images.isEmpty, let folder = safeName(imagesDir) else { return 0 }
  let directory = url.deletingLastPathComponent().appendingPathComponent(folder, isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  var count = 0
  for image in images {
   guard let name = image["name"] as? String, let safe = safeName(name), let encoded = image["data"] as? String,
         let data = Data(base64Encoded: encoded), data.count <= 5_000_000 else { continue }
   let target = directory.appendingPathComponent(safe)
   if let existing = try? Data(contentsOf: target), existing == data { count += 1; continue }
   try data.write(to: target, options: .atomic); count += 1
  }
  return count
 }
}
