import Cocoa
import WebKit
import PDFKit

/// Saves a note, already laid out as HTML by the web app, as a PDF or a Word document.
final class NoteExporter: NSObject, WKNavigationDelegate {
 private var pages: WKWebView?
 private var host: NSWindow?
 private var sourceFile: URL?
 private var destination: URL?
 private var done: ((Error?) -> Void)?

 static func suggestedName(_ title: String) -> String {
  let cleaned = title.components(separatedBy: CharacterSet(charactersIn: "/\\:?*\"<>|")).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
  return cleaned.isEmpty ? "Untitled note" : String(cleaned.prefix(80))
 }

 func save(html: String, format: String, to url: URL, resources: URL, completion: @escaping (Error?) -> Void) {
  if format == "docx" { word(html: html, to: url, completion: completion); return }
  pdf(html: html, to: url, resources: resources, completion: completion)
 }

 private func word(html: String, to url: URL, completion: @escaping (Error?) -> Void) {
  let source = FileManager.default.temporaryDirectory.appendingPathComponent("notival-export-\(UUID().uuidString).html")
  do { try html.write(to: source, atomically: true, encoding: .utf8) } catch { completion(error); return }
  let task = Process(); task.executableURL = URL(fileURLWithPath: "/usr/bin/textutil")
  task.arguments = ["-convert", "docx", "-output", url.path, source.path]
  task.terminationHandler = { finished in
   try? FileManager.default.removeItem(at: source)
   DispatchQueue.main.async {
    completion(finished.terminationStatus == 0 ? nil : NSError(domain: "Notival", code: 1, userInfo: [NSLocalizedDescriptionKey: "Couldn’t create the Word document."]))
   }
  }
  do { try task.run() } catch { completion(error) }
 }

 private func pdf(html: String, to url: URL, resources: URL, completion: @escaping (Error?) -> Void) {
  let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 504, height: 684))
  let host = NSWindow(contentRect: NSRect(x: -3000, y: -3000, width: 504, height: 684), styleMask: [.borderless], backing: .buffered, defer: false)
  host.contentView = view; self.host = host
  view.navigationDelegate = self; pages = view; destination = url; done = completion
  // A page loaded from a string can't read local style sheets and fonts, so load it from a file.
  let math = resources.appendingPathComponent("math/katex.min.css").absoluteString
  let file = FileManager.default.temporaryDirectory.appendingPathComponent("notival-export-\(UUID().uuidString).html")
  do { try html.replacingOccurrences(of: "href=\"math/katex.min.css\"", with: "href=\"\(math)\"").write(to: file, atomically: true, encoding: .utf8) } catch { fail(error); return }
  sourceFile = file
  view.loadFileURL(file, allowingReadAccessTo: URL(fileURLWithPath: "/"))
 }

 // Where a page may end: after a whole paragraph, list item, table row or image, never through the middle of one.
 private static let measure = """
 (()=>{const y=window.scrollY,atomic=[...document.querySelectorAll('p,h1,h2,h3,img,tr,pre,.display-equation,.note-head,li,.pdf-anno,.pdf-brace')].filter(e=>e.tagName!=='LI'||!e.querySelector('ul,ol')).map(e=>{const r=e.getBoundingClientRect();return [r.top+y,r.bottom+y]});
 return JSON.stringify({height:document.documentElement.scrollHeight,atomic})})()
 """

 static func pageBreaks(height: Double, atomic: [[Double]], page: Double) -> [Double] {
  var breaks: [Double] = [0], start = 0.0
  let candidates = atomic.flatMap { [$0[0], $0[1]] }.sorted()
  while height - start > page {
   let limit = start + page
   var cut = limit
   for c in candidates.reversed() where c > start + 40 && c <= limit {
    if !atomic.contains(where: { $0[0] + 0.5 < c && c < $0[1] - 0.5 }) { cut = c; break }
   }
   breaks.append(cut); start = cut
  }
  breaks.append(height)
  return breaks
 }

 func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
  // Give fonts and images a moment to settle before laying out the pages.
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [self] in
   webView.evaluateJavaScript(NoteExporter.measure) { [self] value, error in
    guard let url = destination, let text = value as? String, let data = text.data(using: .utf8),
          let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let height = info["height"] as? Double, let atomic = info["atomic"] as? [[Double]] else { fail(error); return }
    let width = 504.0, page = 684.0
    let breaks = NoteExporter.pageBreaks(height: height, atomic: atomic, page: page)
    let output = PDFDocument()
    var index = 0
    func next() {
     guard index + 1 < breaks.count else { finish(output, url); return }
     let top = breaks[index], slice = breaks[index + 1] - top
     index += 1
     if slice < 1 { next(); return }
     let configuration = WKPDFConfiguration(); configuration.rect = CGRect(x: 0, y: top, width: width, height: slice)
     webView.createPDF(configuration: configuration) { result in
      if case .success(let bytes) = result, let part = PDFDocument(data: bytes)?.page(at: 0) { output.insert(NoteExporter.paper(from: part, height: slice), at: output.pageCount) }
      next()
     }
    }
    next()
   }
  }
 }

 /// Puts a slice of the note on US Letter paper with a margin all round.
 static func paper(from part: PDFPage, height: Double) -> PDFPage {
  let data = NSMutableData(), media = CGRect(x: 0, y: 0, width: 612, height: 792)
  var box = media
  guard let consumer = CGDataConsumer(data: data), let context = CGContext(consumer: consumer, mediaBox: &box, nil), let source = part.pageRef else { return part }
  context.beginPDFPage(nil)
  context.translateBy(x: 54, y: 792 - 54 - height)
  let bounds = part.bounds(for: .mediaBox)
  context.scaleBy(x: 504 / max(bounds.width, 1), y: 1)
  context.drawPDFPage(source)
  context.endPDFPage(); context.closePDF()
  return PDFDocument(data: data as Data)?.page(at: 0) ?? part
 }

 /// Adds the pages of each readable PDF, in order, to the end of a finished guide. Unreadable files are skipped; returns how many were added.
 @discardableResult
 static func append(pdfs paths: [String], to url: URL) -> Int {
  guard let guide = PDFDocument(url: url) else { return 0 }
  var added = 0
  for path in paths where path.hasPrefix("/") && path.lowercased().hasSuffix(".pdf") {
   guard let extra = PDFDocument(url: URL(fileURLWithPath: path)), !extra.isLocked, extra.pageCount > 0 else { continue }
   for index in 0..<extra.pageCount { if let page = extra.page(at: index)?.copy() as? PDFPage { guide.insert(page, at: guide.pageCount) } }
   added += 1
  }
  return added > 0 && guide.write(to: url) ? added : 0
 }

 private func finish(_ document: PDFDocument, _ url: URL) {
  let ok = document.pageCount > 0 && document.write(to: url)
  let completion = done; pages = nil; host = nil; sourceFile.map { try? FileManager.default.removeItem(at: $0) }; sourceFile = nil; destination = nil; done = nil
  completion?(ok ? nil : NSError(domain: "Notival", code: 2, userInfo: [NSLocalizedDescriptionKey: "Couldn’t create the PDF."]))
 }

 private func fail(_ error: Error?) {
  let completion = done; pages = nil; host = nil; sourceFile.map { try? FileManager.default.removeItem(at: $0) }; sourceFile = nil; destination = nil; done = nil
  completion?(error ?? NSError(domain: "Notival", code: 3, userInfo: [NSLocalizedDescriptionKey: "Couldn’t create the PDF."]))
 }

 func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
  fail(error)
 }
}
