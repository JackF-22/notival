import Cocoa
import WebKit
import PDFKit

// Usage: export-test <input.html> <out.pdf> <out.docx> <web dir>
let args = CommandLine.arguments
let html = try! String(contentsOfFile: args[1], encoding: .utf8)
let app = NSApplication.shared; app.setActivationPolicy(.accessory)
let exporter = NoteExporter()
var finished = 0
func check() { finished += 1; if finished == 2 { print("DONE"); exit(0) } }
exporter.save(html: html, format: "pdf", to: URL(fileURLWithPath: args[2]), resources: URL(fileURLWithPath: args[4], isDirectory: true)) { error in
 if let error { print("PDF ERROR \(error)"); exit(1) }
 let doc = PDFDocument(url: URL(fileURLWithPath: args[2]))
 print("PDF pages: \(doc?.pageCount ?? 0)"); print("PDF text: \((doc?.string ?? "").prefix(60).replacingOccurrences(of: "\n", with: "|"))")
 check()
}
let other = NoteExporter()
other.save(html: html, format: "docx", to: URL(fileURLWithPath: args[3]), resources: URL(fileURLWithPath: args[4])) { error in
 if let error { print("DOCX ERROR \(error)"); exit(1) }
 print("DOCX written"); check()
}
app.run()
