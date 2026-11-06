import Foundation
import PDFKit
import AppKit
import CoreText

// Builds a three-page PDF, then checks that PDFFinder counts, orders, wraps and cancels searches.
let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("notival-find-test-\(UUID().uuidString).pdf")
var box = CGRect(x: 0, y: 0, width: 612, height: 792)
let pages = [
 "The cell wall gives the plant cell its shape. A cell membrane sits inside.",
 "Osmosis moves water across the membrane. Turgor pressure builds in the cell.",
 "Résumé of results: no relevant data here, only CELL counts and cell notes."
]
guard let context = CGContext(url as CFURL, mediaBox: &box, nil) else { print("FAILED: could not create pdf"); exit(1) }
for text in pages {
 context.beginPDFPage(nil)
 let attributed = NSAttributedString(string: text, attributes: [.font: NSFont.systemFont(ofSize: 14)])
 let line = CTLineCreateWithAttributedString(attributed)
 context.textPosition = CGPoint(x: 72, y: 700)
 CTLineDraw(line, context)
 context.endPDFPage()
}
context.closePDF()

var failures: [String] = []
func check(_ ok: Bool, _ name: String) { if !ok { failures.append(name) } }
guard let document = PDFDocument(url: url) else { print("FAILED: could not open pdf"); exit(1) }
let finder = PDFFinder()
func wait(for finder: PDFFinder) {
 let deadline = Date().addingTimeInterval(10)
 while finder.searching && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
}

// Every match is found, case-insensitively, across pages.
finder.search("cell", in: document); wait(for: finder)
check(finder.matches.count == 6, "finds 'cell' 6 times, got \(finder.matches.count)")
check(!finder.searching, "search finishes")
check(finder.current != nil, "starts on the first match")
let pagesOfMatches = finder.matches.compactMap { match in match.pages.first.flatMap { document.index(for: $0) } }
check(pagesOfMatches == pagesOfMatches.sorted(), "matches come in reading order")
check(Set(pagesOfMatches) == [0, 1, 2], "matches appear on every page")
// Stepping wraps both ways.
let first = finder.current
for _ in 0..<6 { finder.step(1) }
check(finder.current === first || finder.index == 0, "wraps forward to the first match")
finder.step(-1)
check(finder.index == 5, "steps back from the first to the last match")
// A very common word stops at the limit instead of flooding the viewer.
finder.limit = 3
finder.search("cell", in: document); wait(for: finder)
check(finder.matches.count == 3 && finder.capped && !finder.searching, "stops at the limit and says so, got \(finder.matches.count)")
finder.limit = 500
finder.search("cell", in: document); wait(for: finder)
check(!finder.capped && finder.matches.count == 6, "a normal search is not capped")
// Accents are ignored, and a miss reports nothing.
finder.search("resume", in: document); wait(for: finder)
check(finder.matches.count == 1, "matches Résumé when typing resume, got \(finder.matches.count)")
finder.search("zebra", in: document); wait(for: finder)
check(finder.matches.isEmpty && finder.step(1) == nil, "no matches for a missing word")
// An empty query clears everything.
finder.search("   ", in: document)
check(finder.matches.isEmpty && !finder.searching, "blank query clears results")
// A new search replaces the old one.
finder.search("membrane", in: document); wait(for: finder)
check(finder.matches.count == 2, "finds 'membrane' twice, got \(finder.matches.count)")
finder.reset()
check(finder.matches.isEmpty && finder.query.isEmpty, "reset clears the finder")
// The stress case: a one-letter search through a long document finishes quickly and stops at the limit.
let bigURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("notival-find-big-\(UUID().uuidString).pdf")
var bigBox = CGRect(x: 0, y: 0, width: 612, height: 792)
if let big = CGContext(bigURL as CFURL, mediaBox: &bigBox, nil) {
 for page in 0..<200 {
  big.beginPDFPage(nil)
  for row in 0..<20 {
   let line = CTLineCreateWithAttributedString(NSAttributedString(string: "Page \(page) line \(row): the quick brown fox jumps over the lazy dog, everywhere.", attributes: [.font: NSFont.systemFont(ofSize: 10)]))
   big.textPosition = CGPoint(x: 40, y: 740 - CGFloat(row) * 14); CTLineDraw(line, big)
  }
  big.endPDFPage()
 }
 big.closePDF()
 if let bigDocument = PDFDocument(url: bigURL) {
  let began = Date()
  finder.search("e", in: bigDocument); wait(for: finder)
  let seconds = Date().timeIntervalSince(began)
  check(finder.capped && finder.matches.count == 500, "a one-letter search stops at 500, got \(finder.matches.count)")
  check(seconds < 5, "a one-letter search over 200 pages is quick, took \(seconds)s")
  finder.reset()
 }
}
try? FileManager.default.removeItem(at: bigURL)
try? FileManager.default.removeItem(at: url)
print(failures.isEmpty ? "OK" : "FAILED: " + failures.joined(separator: "; "))
exit(failures.isEmpty ? 0 : 1)
