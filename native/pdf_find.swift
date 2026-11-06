import Foundation
import PDFKit
import AppKit

/// Searches a PDF as the reader types and keeps track of which match is current.
final class PDFFinder: NSObject, PDFDocumentDelegate {
 private(set) var matches: [PDFSelection] = []
 private(set) var index = 0
 private(set) var searching = false
 private(set) var query = ""
 /// True when the search stopped at `limit` matches, so the count is a floor, not a total.
 private(set) var capped = false
 var limit = 500
 private weak var document: PDFDocument?
 /// Called whenever matches arrive or the search finishes.
 var onChange: (() -> Void)?
 static let highlight = NSColor(calibratedRed: 1, green: 0.84, blue: 0.2, alpha: 0.55)
 /// The match you are on is drawn in a stronger colour than the rest, so no text has to be selected.
 static let currentHighlight = NSColor(calibratedRed: 1, green: 0.55, blue: 0.1, alpha: 0.75)

 var current: PDFSelection? { matches.indices.contains(index) ? matches[index] : nil }

 func search(_ text: String, in document: PDFDocument) {
  cancel()
  self.document = document
  matches = []; index = 0; capped = false
  query = text.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !query.isEmpty else { onChange?(); return }
  searching = true
  document.delegate = self
  document.beginFindString(query, withOptions: [.caseInsensitive, .diacriticInsensitive])
  onChange?()
 }

 func cancel() {
  document?.cancelFindString()
  searching = false
 }

 func reset() { cancel(); matches = []; index = 0; query = ""; capped = false }

 /// Move to the next (1) or previous (-1) match, wrapping around.
 @discardableResult func step(_ delta: Int) -> PDFSelection? {
  guard !matches.isEmpty else { return nil }
  index = (index + delta + matches.count) % matches.count
  return matches[index]
 }

 // PDFDocumentDelegate
 func didMatchString(_ instance: PDFSelection) {
  let apply = { [weak self] in
   guard let self, self.searching, let copy = instance.copy() as? PDFSelection else { return }
   copy.color = PDFFinder.highlight
   self.matches.append(copy)
   if self.matches.count >= self.limit { self.capped = true; self.cancel() }
   self.onChange?()
  }
  if Thread.isMainThread { apply() } else { DispatchQueue.main.async(execute: apply) }
 }
 func documentDidEndDocumentFind(_ notification: Notification) {
  let finish = { [weak self] in self?.searching = false; self?.onChange?() }
  if Thread.isMainThread { finish() } else { DispatchQueue.main.async(execute: finish) }
 }
}
