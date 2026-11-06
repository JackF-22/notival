import Cocoa
import WebKit
import PDFKit
import UniformTypeIdentifiers
import Carbon

// Foliose's original Markdown files remain in place. Margin takes an independent
// copy on import, keyed by the Foliose record ID so reopening never duplicates it.
enum FolioseImporter {
 static func notes() -> (items: [[String: Any]], skipped: Int) {
  let root = ProcessInfo.processInfo.environment["MARGIN_FOLIOSE_NOTES_DIR"].map { URL(fileURLWithPath: $0) }
   ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("FilePane/Notes")
  guard let files = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else { return ([], 0) }
  let records = files.filter { $0.pathExtension == "json" && $0.lastPathComponent != "draft.json" }
  var imported: [[String: Any]] = records.compactMap { record in
   guard let data = try? Data(contentsOf: record), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
         let id = value["id"] as? String, let fileText = value["file"] as? String else { return nil }
   let file = URL(string: fileText)?.isFileURL == true ? URL(string: fileText)! : URL(fileURLWithPath: fileText)
   let body = (try? String(contentsOf: file, encoding: .utf8)) ?? (value["body"] as? String ?? "")
   guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
   let title = body.split(whereSeparator: \.isNewline).first.map(String.init)?.replacingOccurrences(of: #"^#{1,6}\s+"#, with: "", options: .regularExpression) ?? "Untitled note"
   let modified = (value["modified"] as? Double).map { ($0 + 978307200) * 1000 } ?? Date().timeIntervalSince1970 * 1000
   var note: [String: Any] = ["id": id, "origin": "foliose:\(id)", "title": String(title.prefix(100)), "updated": modified,
           "pinned": value["pinned"] as? Bool ?? false, "blocks": [["id": UUID().uuidString, "type": "text", "text": body]],
           "nodes": [], "sourceFile": file.path]
   if let trashed = value["trashedAt"] as? Double { note["deletedAt"] = (trashed + 978307200) * 1000 }
   return note
  }
  var skipped = records.count - imported.count
  let draftFile = root.appendingPathComponent("draft.json")
  if FileManager.default.fileExists(atPath: draftFile.path) {
   if let data = try? Data(contentsOf: draftFile), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let body = value["body"] as? String {
    if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
     imported.append(["id": "foliose-draft", "origin": "foliose:draft", "title": "Unfinished Foliose draft",
                      "updated": Date().timeIntervalSince1970 * 1000, "pinned": false,
                      "blocks": [["id": UUID().uuidString, "type": "text", "text": body]], "nodes": []])
    }
   } else { skipped += 1 }
  }
  return (imported, skipped)
 }
}

// The sheet is a dedicated services recipient, so a delayed iPad response
// keeps the original insertion target instead of following editor focus.
final class SketchCaptureView: NSView, NSServicesMenuRequestor {
 var receive: ((String) -> Void)?
 weak var deviceStatus: NSTextField?
 override var acceptsFirstResponder: Bool { true }
 override func validRequestor(forSendType sendType: NSPasteboard.PasteboardType?, returnType: NSPasteboard.PasteboardType?) -> Any? {
  if let type=returnType,NSImage.imageTypes.contains(type.rawValue){return self}
  return super.validRequestor(forSendType:sendType,returnType:returnType)
 }
 func readSelection(from pasteboard: NSPasteboard) -> Bool {
  guard let image=NSImage(pasteboard:pasteboard) else{return false}
  return deliver(image)
 }
 func deliver(_ image: NSImage) -> Bool {
  guard let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let data=bitmap.representation(using:.png,properties:[:]),data.count<=8_000_000 else{return false}
  receive?("data:image/png;base64,"+data.base64EncodedString());return true
 }
 @objc func chooseDevice(_ sender:NSButton){
  guard let window else{return};window.makeFirstResponder(self)
  let menu=NSMenu(title:"Insert from iPad")
  let file=NSMenuItem(title:"Import an exported drawing…",action:#selector(importDrawing),keyEquivalent:"");file.target=self;menu.addItem(file)
  let localPoint=NSPoint(x:sender.frame.minX,y:sender.frame.minY),windowPoint=convert(localPoint,to:nil)
  guard let event=NSEvent.mouseEvent(with:.rightMouseDown,location:windowPoint,modifierFlags:[],timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:window.windowNumber,context:nil,eventNumber:0,clickCount:1,pressure:1) else{return}
  deviceStatus?.stringValue="Showing the nearby devices reported by macOS…"
  // AppKit, not Margin, must insert and populate Continuity devices in a
  // contextual menu. Adding an importFromDeviceIdentifier item ourselves
  // leaves the item disabled even when a device may otherwise be eligible.
  NSMenu.popUpContextMenu(menu,with:event,for:self)
 }
 @objc func showDeviceHelp(){
  guard let window else{return};let alert=NSAlert();alert.messageText="If your iPad is not listed";alert.informativeText="Make sure the Mac and iPad use the same Apple Account with two-factor authentication, then turn on Wi-Fi, Bluetooth, and Handoff on both devices. Keep the iPad nearby and unlocked, then try Refresh iPads again.";alert.addButton(withTitle:"Apple setup guide");alert.addButton(withTitle:"Done")
  alert.beginSheetModal(for:window){response in if response == .alertFirstButtonReturn,let url=URL(string:"https://support.apple.com/102269"){NSWorkspace.shared.open(url)}}
 }
 @objc func importDrawing(){
  guard let window else{return};let panel=NSOpenPanel();panel.allowedContentTypes=[.png,.jpeg,.tiff];panel.allowsMultipleSelection=false
  panel.beginSheetModal(for:window){response in guard response == .OK,let url=panel.url,let image=NSImage(contentsOf:url) else{return};if !self.deliver(image){let alert=NSAlert();alert.messageText="Choose a drawing smaller than 8 MB when converted to PNG.";alert.beginSheetModal(for:window)}}
 }
}

/// Colours the web app is using, so the PDF header always matches the chosen palette and day or night mode.
struct NotivalTheme {
 var background = NSColor(hex: "#fcfbf8")!, ink = NSColor(hex: "#303b36")!, muted = NSColor(hex: "#8a9188")!
 var line = NSColor(hex: "#e6e8e0")!, soft = NSColor(hex: "#eaf0e6")!, accent = NSColor(hex: "#4a6452")!
 var dark = false
}
extension NSColor {
 convenience init?(hex: String) {
  var value = hex.trimmingCharacters(in: .whitespaces); if value.hasPrefix("#") { value.removeFirst() }
  if value.count == 3 { value = value.map { "\($0)\($0)" }.joined() }
  guard value.count == 6, let number = UInt32(value, radix: 16) else { return nil }
  self.init(srgbRed: CGFloat((number >> 16) & 255) / 255, green: CGFloat((number >> 8) & 255) / 255, blue: CGFloat(number & 255) / 255, alpha: 1)
 }
}

/// A quiet icon button for the PDF header: a symbol that darkens and gains a soft background under the pointer.
final class PDFBarButton: NSButton {
 var idleTint = NSColor.secondaryLabelColor { didSet { setHover(false) } }
 var hoverTint = NSColor.labelColor
 var hoverFill = NSColor.labelColor.withAlphaComponent(0.09)
 init(symbol: String, tip: String, target: AnyObject?, action: Selector?) {
  super.init(frame: .zero)
  self.target = target; self.action = action
  isBordered = false; bezelStyle = .regularSquare; imagePosition = .imageOnly; toolTip = tip; setAccessibilityLabel(tip)
  image = NSImage(systemSymbolName: symbol, accessibilityDescription: tip)?.withSymbolConfiguration(.init(pointSize: 13, weight: .medium))
  contentTintColor = idleTint; translatesAutoresizingMaskIntoConstraints = false
  widthAnchor.constraint(equalToConstant: 30).isActive = true; heightAnchor.constraint(equalToConstant: 28).isActive = true
  wantsLayer = true; layer?.cornerRadius = 7
  addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil))
 }
 required init?(coder: NSCoder) { fatalError() }
 override var isEnabled: Bool { didSet { alphaValue = isEnabled ? 1 : 0.35 } }
 private func setHover(_ on: Bool) {
  layer?.backgroundColor = (on && isEnabled ? hoverFill : NSColor.clear).cgColor
  contentTintColor = on && isEnabled ? hoverTint : idleTint
 }
 override func mouseEntered(with event: NSEvent) { setHover(true) }
 override func mouseExited(with event: NSEvent) { setHover(false) }
 func apply(_ theme: NotivalTheme) { idleTint = theme.muted; hoverTint = theme.ink; hoverFill = theme.accent.withAlphaComponent(theme.dark ? 0.22 : 0.14); setHover(false) }
}

/// A transparent layer over the PDF: draw around a figure (hold Shift for a rectangle) to lift it into the note.
final class TraceView: NSView {
 var onFinish: (([CGPoint], Bool) -> Void)?
 var onCancel: (() -> Void)?
 private var points: [CGPoint] = []
 private var rectangle = true
 var equationMode = false
 // A square box is the default; Shift, or the C key (which sticks), switches to a freehand curve.
 private var freehand = false
 private func boxMode(_ flags: NSEvent.ModifierFlags) -> Bool { freehand ? flags.contains(.shift) : !flags.contains(.shift) }
 override var acceptsFirstResponder: Bool { true }
 override func flagsChanged(with event: NSEvent) { rectangle = boxMode(event.modifierFlags); needsDisplay = true }
 override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }
 override func mouseDown(with event: NSEvent) { points = [convert(event.locationInWindow, from: nil)]; rectangle = boxMode(event.modifierFlags); needsDisplay = true }
 override func mouseDragged(with event: NSEvent) { points.append(convert(event.locationInWindow, from: nil)); rectangle = boxMode(event.modifierFlags); needsDisplay = true }
 override func mouseUp(with event: NSEvent) {
  let captured = points
  guard captured.count > 3 else { points = []; needsDisplay = true; return }
  onFinish?(captured, rectangle)
 }
 override func keyDown(with event: NSEvent) {
  if event.keyCode == 53 { onCancel?() }
  else if event.keyCode == 8, !event.modifierFlags.contains(.command) { freehand.toggle(); rectangle = boxMode(event.modifierFlags); needsDisplay = true }
  else { super.keyDown(with: event) }
 }
 private func tracedPath() -> NSBezierPath? {
  guard let first = points.first, let last = points.last, points.count > 1 else { return nil }
  if rectangle { return NSBezierPath(rect: NSRect(x: min(first.x, last.x), y: min(first.y, last.y), width: abs(first.x - last.x), height: abs(first.y - last.y))) }
  let path = NSBezierPath(); path.move(to: first); for point in points.dropFirst() { path.line(to: point) }; path.close(); return path
 }
 override func draw(_ dirtyRect: NSRect) {
  NSColor.black.withAlphaComponent(0.10).setFill(); bounds.fill()
  let accent = NSColor(calibratedRed: 0.47, green: 0.31, blue: 0.83, alpha: 1)
  if let path = tracedPath() { accent.withAlphaComponent(0.16).setFill(); path.fill(); accent.setStroke(); path.lineWidth = 2; path.setLineDash([7, 4], count: 2, phase: 0); path.stroke() }
  let boxNow = points.isEmpty ? boxMode(NSEvent.modifierFlags) : rectangle
  let hint = equationMode ? "Drag a box around an equation to turn it into LaTeX  ·  esc to cancel" as NSString : (boxNow ? "Drag a box around what you want in your note  ·  hold ⇧ or press C for freehand  ·  esc to cancel" : "Draw freehand around what you want  ·  hold ⇧ or press C for a box  ·  esc to cancel") as NSString
  let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12, weight: .medium), .foregroundColor: NSColor.white]
  let size = hint.size(withAttributes: attributes), pill = NSRect(x: (bounds.width - size.width) / 2 - 14, y: bounds.height - size.height - 24, width: size.width + 28, height: size.height + 12)
  accent.setFill(); NSBezierPath(roundedRect: pill, xRadius: 10, yRadius: 10).fill(); hint.draw(at: NSPoint(x: pill.minX + 14, y: pill.minY + 6), withAttributes: attributes)
 }
}

final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, NSSearchFieldDelegate {
 var window: NSWindow!
 var web: WKWebView!
 let noteExporter = NoteExporter()
 var split: NSSplitView!
 var pdfPane: NSView!
 var pdfView: PDFView!
 var pdfTitle: NSTextField!
 var pdfPage: NSTextField!
 var pdfComment: NSButton!
 var pdfBarBackground: NSView!
 var pdfFinder = PDFFinder()
 var pdfFindBar: NSView!
 var pdfFindBackground: NSView!
 var pdfFindHairline: NSView!
 var pdfFindField: NSSearchField!
 var pdfFindCount: NSTextField!
 var pdfFindHeight: NSLayoutConstraint!
 var pdfBarHairline: NSView!
 var pdfIcon: NSImageView!
 var pdfButtons: [PDFBarButton] = []
 var pdfDividers: [NSView] = []
 var theme = NotivalTheme()
 func applyPDFTheme() {
  guard pdfBarBackground != nil else { return }
  pdfPane.appearance = NSAppearance(named: theme.dark ? .darkAqua : .aqua)
  pdfBarBackground.layer?.backgroundColor = theme.background.cgColor
  pdfBarHairline.layer?.backgroundColor = theme.line.cgColor
  pdfTitle.textColor = theme.ink; pdfPage.textColor = theme.muted; pdfIcon.contentTintColor = theme.accent
  pdfButtons.forEach { $0.apply(theme) }
  pdfDividers.forEach { $0.layer?.backgroundColor = theme.line.cgColor }
  pdfFindBackground?.layer?.backgroundColor = theme.background.cgColor
  pdfFindHairline?.layer?.backgroundColor = theme.line.cgColor
  pdfFindCount?.textColor = theme.muted
  pdfView.backgroundColor = theme.dark ? theme.soft : theme.soft.blended(withFraction: 0.35, of: theme.background) ?? theme.soft
 }
 var currentPDF: URL?
 var pdfSelectionTimer: Timer?
 var suppressPDFSelection = false
 var pending: [String: Any]?
 var ready = false
 var drawingSheet: NSPanel?
 var quickNoteKey: EventHotKeyRef?
 var quickNoteHandler: EventHandlerRef?
 let storage = ProcessInfo.processInfo.environment["MARGIN_DATA_DIR"].map { URL(fileURLWithPath: $0).appendingPathComponent("notes.json") }
  ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Margin/notes.json")
 func applicationDidFinishLaunching(_ notification: Notification) {
  let menu = NSMenu(); let item = NSMenuItem(); menu.addItem(item)
  let appMenu = NSMenu(); appMenu.addItem(withTitle: "About Notival", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
  appMenu.addItem(.separator()); appMenu.addItem(withTitle: "Quit Notival", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"); item.submenu = appMenu
  let fileItem=NSMenuItem();menu.addItem(fileItem);let fileMenu=NSMenu(title:"File");fileItem.submenu=fileMenu
  let openPDFItem=fileMenu.addItem(withTitle:"Open PDF…",action:#selector(choosePDF),keyEquivalent:"o");openPDFItem.target=self
  let finderPDFItem=fileMenu.addItem(withTitle:"Open PDF from Finder…",action:#selector(choosePDFFromFinder),keyEquivalent:"o");finderPDFItem.keyEquivalentModifierMask=[.command,.shift];finderPDFItem.target=self
  let folioseItem=fileMenu.addItem(withTitle:"Open PDF from Foliose…",action:#selector(choosePDFFromFoliose),keyEquivalent:"o");folioseItem.keyEquivalentModifierMask=[.command,.option];folioseItem.target=self
  let deviceItem=NSMenuItem(title:"Insert from iPad",action:nil,keyEquivalent:"");deviceItem.identifier=NSMenuItem.importFromDeviceIdentifier;fileMenu.addItem(deviceItem)
  fileMenu.addItem(.separator())
  let quoteItem=fileMenu.addItem(withTitle:"Capture PDF Quote",action:#selector(capturePDFQuote),keyEquivalent:"q");quoteItem.keyEquivalentModifierMask=[.command,.shift];quoteItem.target=self
  let traceItem=fileMenu.addItem(withTitle:"Trace Figure from PDF",action:#selector(startTrace),keyEquivalent:"r");traceItem.keyEquivalentModifierMask=[.command,.shift];traceItem.target=self
  let findItem=fileMenu.addItem(withTitle:"Find in PDF…",action:#selector(showPDFFind),keyEquivalent:"f");findItem.target=self
  let findNextItem=fileMenu.addItem(withTitle:"Find Next in PDF",action:#selector(findNextInPDF),keyEquivalent:"g");findNextItem.target=self
  let findPreviousItem=fileMenu.addItem(withTitle:"Find Previous in PDF",action:#selector(findPreviousInPDF),keyEquivalent:"g");findPreviousItem.keyEquivalentModifierMask=[.command,.shift];findPreviousItem.target=self
  let equationItem=fileMenu.addItem(withTitle:"Trace Equation from PDF as LaTeX",action:#selector(startEquationTrace),keyEquivalent:"r");equationItem.keyEquivalentModifierMask=[.command,.option];equationItem.target=self
  let setupItem=fileMenu.addItem(withTitle:"Set Up Equation Recognition…",action:#selector(setUpEquationRecognition),keyEquivalent:"");setupItem.target=self
  let inlineEquationItem=fileMenu.addItem(withTitle:"Trace Inline Equation from PDF as LaTeX",action:#selector(startInlineEquationTrace),keyEquivalent:"r");inlineEquationItem.keyEquivalentModifierMask=[.command,.option,.shift];inlineEquationItem.target=self
  let thoughtItem=fileMenu.addItem(withTitle:"Add PDF Page Thought",action:#selector(capturePDFThought),keyEquivalent:"p");thoughtItem.keyEquivalentModifierMask=[.command,.shift];thoughtItem.target=self
  let editItem = NSMenuItem(); menu.addItem(editItem); let edit = NSMenu(title: "Edit"); editItem.submenu = edit
  for (title, action, key) in [("Undo", "undo:", "z"),("Redo", "redo:", "Z"),("Cut", "cut:", "x"),("Copy", "copy:", "c"),("Paste", "paste:", "v"),("Select All", "selectAll:", "a")] { edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key) }
  edit.addItem(.separator())
  for (title,command,key) in [("Bold","bold","b"),("Italic","italic","i"),("Underline","underline","u")] { let item=edit.addItem(withTitle:title,action:#selector(formatNoteText(_:)),keyEquivalent:key);item.target=self;item.representedObject=command }
  NSApp.mainMenu = menu
  let config = WKWebViewConfiguration(); config.userContentController.add(self, name: "margin")
  web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self; web.uiDelegate = self
  configurePDFPane()
  split = NSSplitView(frame: .zero); split.isVertical = true; split.dividerStyle = .thin
  split.addArrangedSubview(pdfPane); split.addArrangedSubview(web); pdfPane.isHidden = true
  window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 1120,height: 790),styleMask: [.titled,.closable,.miniaturizable,.resizable],backing: .buffered,defer: false)
  window.acceptsMouseMovedEvents = true
  window.title = "Notival"; window.minSize = NSSize(width: 720,height: 520); window.contentView = split; window.center(); window.setFrameAutosaveName("MarginMain"); window.isReleasedWhenClosed = false
  let url = Bundle.main.resourceURL!.appendingPathComponent("web/index.html")
  web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
  registerQuickNoteKey()
 }
 func configurePDFPane() {
  pdfPane = NSView(frame: .zero)
  let bar = NSView(frame: .zero); bar.translatesAutoresizingMaskIntoConstraints = false
  pdfView = PDFView(frame: .zero); pdfView.translatesAutoresizingMaskIntoConstraints = false; pdfView.autoScales = true
  pdfView.displayMode = .singlePageContinuous; pdfView.displayDirection = .vertical; pdfView.displaysPageBreaks = true
  // The header: a frosted bar with the document on the left and grouped icon controls on the right.
  let background = NSView(frame: .zero); background.wantsLayer = true; background.translatesAutoresizingMaskIntoConstraints = false
  let hairline = NSView(frame: .zero); hairline.wantsLayer = true; hairline.translatesAutoresizingMaskIntoConstraints = false; hairline.heightAnchor.constraint(equalToConstant: 1).isActive = true
  pdfBarBackground = background; pdfBarHairline = hairline
  let icon = NSImageView(image: NSImage(systemSymbolName: "doc.text", accessibilityDescription: "PDF")?.withSymbolConfiguration(.init(pointSize: 14, weight: .regular)) ?? NSImage()); pdfIcon = icon; icon.translatesAutoresizingMaskIntoConstraints = false
  pdfTitle = NSTextField(labelWithString: "PDF"); pdfTitle.translatesAutoresizingMaskIntoConstraints = false; pdfTitle.lineBreakMode = .byTruncatingMiddle
  pdfTitle.font = .systemFont(ofSize: 12.5, weight: .semibold)
  pdfTitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal); pdfTitle.setContentHuggingPriority(.defaultLow, for: .horizontal)
  pdfPage = NSTextField(labelWithString: ""); pdfPage.translatesAutoresizingMaskIntoConstraints = false; pdfPage.alignment = .center
  pdfPage.font = .monospacedDigitSystemFont(ofSize: 11.5, weight: .medium)
  pdfPage.widthAnchor.constraint(greaterThanOrEqualToConstant: 46).isActive = true
  func tool(_ symbol: String, _ tip: String, _ action: Selector) -> PDFBarButton { let button = PDFBarButton(symbol: symbol, tip: tip, target: self, action: action); pdfButtons.append(button); return button }
  func divider() -> NSView { let line = NSView(frame: .zero); line.wantsLayer = true; line.translatesAutoresizingMaskIntoConstraints = false; line.widthAnchor.constraint(equalToConstant: 1).isActive = true; line.heightAnchor.constraint(equalToConstant: 16).isActive = true; pdfDividers.append(line); return line }
  let previous = tool("chevron.left", "Previous page", #selector(previousPDFPage))
  let next = tool("chevron.right", "Next page", #selector(nextPDFPage))
  let quote = tool("text.quote", "Add the selected text to this note · ⌘⇧Q", #selector(capturePDFQuote))
  let comment = tool("bubble.left", "Comment on the selected text", #selector(commentPDFSelection)); comment.isEnabled = false; pdfComment = comment
  let thought = tool("lightbulb", "Add a thought linked to this page · ⌘⇧P", #selector(capturePDFThought))
  let trace = tool("viewfinder", "Box a figure to add it to this note (⇧ for freehand) · ⌘⇧R", #selector(startTrace))
  let formula = tool("x.squareroot", "Turn an equation into LaTeX · ⌥⌘R", #selector(showEquationMenu(_:)))
  let close = tool("xmark", "Close the PDF", #selector(closePDF))
  let controls = NSStackView(views: [previous, pdfPage, next, divider(), quote, comment, thought, divider(), trace, formula, divider(), close])
  controls.orientation = .horizontal; controls.alignment = .centerY; controls.spacing = 3; controls.translatesAutoresizingMaskIntoConstraints = false
  controls.setCustomSpacing(8, after: next); controls.setCustomSpacing(10, after: thought); controls.setCustomSpacing(10, after: formula)
  controls.setContentHuggingPriority(.required, for: .horizontal); controls.setContentCompressionResistancePriority(.required, for: .horizontal)
  bar.addSubview(background); bar.addSubview(hairline); bar.addSubview(icon); bar.addSubview(pdfTitle); bar.addSubview(controls)
  // The find bar sits under the header and takes no room until ⌘F opens it.
  let findBar = NSView(frame: .zero); findBar.translatesAutoresizingMaskIntoConstraints = false; findBar.isHidden = true; pdfFindBar = findBar
  let findBackground = NSView(frame: .zero); findBackground.wantsLayer = true; findBackground.translatesAutoresizingMaskIntoConstraints = false; pdfFindBackground = findBackground
  let findLine = NSView(frame: .zero); findLine.wantsLayer = true; findLine.translatesAutoresizingMaskIntoConstraints = false; findLine.heightAnchor.constraint(equalToConstant: 1).isActive = true; pdfFindHairline = findLine
  let field = NSSearchField(frame: .zero); field.translatesAutoresizingMaskIntoConstraints = false; field.placeholderString = "Find in PDF, then press Return"; field.delegate = self; field.sendsSearchStringImmediately = false; field.focusRingType = .none
  field.setAccessibilityLabel("Find in PDF"); pdfFindField = field
  let found = NSTextField(labelWithString: ""); found.translatesAutoresizingMaskIntoConstraints = false; found.font = .monospacedDigitSystemFont(ofSize: 11.5, weight: .medium); found.alignment = .right; pdfFindCount = found
  found.setContentCompressionResistancePriority(.required, for: .horizontal); found.widthAnchor.constraint(greaterThanOrEqualToConstant: 70).isActive = true
  let upButton = tool("chevron.up", "Previous match · ⇧⌘G", #selector(findPreviousInPDF))
  let downButton = tool("chevron.down", "Next match · ⌘G", #selector(findNextInPDF))
  let doneButton = tool("xmark", "Close search · Esc", #selector(hidePDFFind))
  for item in [findBackground, findLine, field, found, upButton, downButton, doneButton] as [NSView] { findBar.addSubview(item) }
  pdfFindHeight = findBar.heightAnchor.constraint(equalToConstant: 0)
  pdfPane.addSubview(pdfView); pdfPane.addSubview(findBar); pdfPane.addSubview(bar)
  NSLayoutConstraint.activate([
   bar.leadingAnchor.constraint(equalTo:pdfPane.leadingAnchor),bar.trailingAnchor.constraint(equalTo:pdfPane.trailingAnchor),bar.topAnchor.constraint(equalTo:pdfPane.topAnchor),bar.heightAnchor.constraint(equalToConstant:56),
   background.leadingAnchor.constraint(equalTo:bar.leadingAnchor),background.trailingAnchor.constraint(equalTo:bar.trailingAnchor),background.topAnchor.constraint(equalTo:bar.topAnchor),background.bottomAnchor.constraint(equalTo:bar.bottomAnchor),
   hairline.leadingAnchor.constraint(equalTo:bar.leadingAnchor),hairline.trailingAnchor.constraint(equalTo:bar.trailingAnchor),hairline.bottomAnchor.constraint(equalTo:bar.bottomAnchor),
   icon.leadingAnchor.constraint(equalTo:bar.leadingAnchor,constant:14),icon.centerYAnchor.constraint(equalTo:bar.centerYAnchor),icon.widthAnchor.constraint(equalToConstant:16),
   pdfTitle.leadingAnchor.constraint(equalTo:icon.trailingAnchor,constant:8),pdfTitle.centerYAnchor.constraint(equalTo:bar.centerYAnchor),pdfTitle.trailingAnchor.constraint(lessThanOrEqualTo:controls.leadingAnchor,constant:-12),
   controls.trailingAnchor.constraint(equalTo:bar.trailingAnchor,constant:-10),controls.centerYAnchor.constraint(equalTo:bar.centerYAnchor),
   findBar.leadingAnchor.constraint(equalTo:pdfPane.leadingAnchor),findBar.trailingAnchor.constraint(equalTo:pdfPane.trailingAnchor),findBar.topAnchor.constraint(equalTo:bar.bottomAnchor),pdfFindHeight,
   findBackground.leadingAnchor.constraint(equalTo:findBar.leadingAnchor),findBackground.trailingAnchor.constraint(equalTo:findBar.trailingAnchor),findBackground.topAnchor.constraint(equalTo:findBar.topAnchor),findBackground.bottomAnchor.constraint(equalTo:findBar.bottomAnchor),
   findLine.leadingAnchor.constraint(equalTo:findBar.leadingAnchor),findLine.trailingAnchor.constraint(equalTo:findBar.trailingAnchor),findLine.bottomAnchor.constraint(equalTo:findBar.bottomAnchor),
   field.leadingAnchor.constraint(equalTo:findBar.leadingAnchor,constant:14),field.centerYAnchor.constraint(equalTo:findBar.centerYAnchor),field.heightAnchor.constraint(equalToConstant:26),
   found.leadingAnchor.constraint(equalTo:field.trailingAnchor,constant:10),found.centerYAnchor.constraint(equalTo:findBar.centerYAnchor),
   upButton.leadingAnchor.constraint(equalTo:found.trailingAnchor,constant:6),upButton.centerYAnchor.constraint(equalTo:findBar.centerYAnchor),
   downButton.leadingAnchor.constraint(equalTo:upButton.trailingAnchor,constant:2),downButton.centerYAnchor.constraint(equalTo:findBar.centerYAnchor),
   doneButton.leadingAnchor.constraint(equalTo:downButton.trailingAnchor,constant:6),doneButton.trailingAnchor.constraint(equalTo:findBar.trailingAnchor,constant:-10),doneButton.centerYAnchor.constraint(equalTo:findBar.centerYAnchor),
   pdfView.leadingAnchor.constraint(equalTo:pdfPane.leadingAnchor),pdfView.trailingAnchor.constraint(equalTo:pdfPane.trailingAnchor),pdfView.topAnchor.constraint(equalTo:findBar.bottomAnchor),pdfView.bottomAnchor.constraint(equalTo:pdfPane.bottomAnchor)
  ])
  applyPDFTheme()
  NotificationCenter.default.addObserver(self,selector:#selector(pdfPageChanged),name:Notification.Name.PDFViewPageChanged,object:pdfView)
  NotificationCenter.default.addObserver(self,selector:#selector(pdfSelectionChanged),name:Notification.Name.PDFViewSelectionChanged,object:pdfView)
 }
 func beginDrawing(_ request:[String:Any]){
  guard drawingSheet==nil,let requestID=request["requestID"] as? String else{return}
  let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:470,height:230),styleMask:[.titled],backing:.buffered,defer:false);panel.title="Nearby iPads"
  let capture=SketchCaptureView(frame:NSRect(x:0,y:0,width:470,height:230));panel.contentView=capture
  let title=NSTextField(labelWithString:"Draw on iPad. Continue here.");title.font = .systemFont(ofSize:20,weight:.semibold);title.frame=NSRect(x:24,y:178,width:422,height:28)
  let detail=NSTextField(wrappingLabelWithString:"Notival now opens Apple’s nearby-device list automatically. Select an iPad and choose Add Sketch; tapping Done on iPad inserts it at your saved note position.\n\nNotability and Notes drawings can still be imported as images.");detail.frame=NSRect(x:24,y:88,width:422,height:76)
  let status=NSTextField(labelWithString:"Looking for nearby iPads…");status.textColor = .secondaryLabelColor;status.frame=NSRect(x:24,y:62,width:422,height:20);capture.deviceStatus=status
  let choose=NSButton(title:"Refresh iPads",target:capture,action:#selector(SketchCaptureView.chooseDevice(_:)));choose.frame=NSRect(x:24,y:20,width:134,height:32);choose.bezelStyle = .rounded
  let file=NSButton(title:"Import image…",target:capture,action:#selector(SketchCaptureView.importDrawing));file.frame=NSRect(x:164,y:20,width:104,height:32);file.bezelStyle = .rounded
  let help=NSButton(title:"Not listed?",target:capture,action:#selector(SketchCaptureView.showDeviceHelp));help.frame=NSRect(x:274,y:20,width:98,height:32);help.bezelStyle = .rounded
  let cancel=NSButton(title:"Cancel",target:self,action:#selector(cancelDrawing));cancel.frame=NSRect(x:378,y:20,width:68,height:32);cancel.bezelStyle = .rounded
  [title,detail,status,choose,file,help,cancel].forEach{capture.addSubview($0)}
  capture.receive={[weak self] image in guard let self else{return};self.js("window.marginDrawingReceived",["requestID":requestID,"image":image]);self.finishDrawing()}
  drawingSheet=panel;window.beginSheet(panel);panel.makeFirstResponder(capture)
  DispatchQueue.main.async{capture.chooseDevice(choose)}
 }
 func finishDrawing(){guard let panel=drawingSheet else{return};window.endSheet(panel);panel.orderOut(nil);drawingSheet=nil}
 @objc func cancelDrawing(){finishDrawing();js("window.marginDrawingCancelled",NSNull())}
 func openPDF(_ url: URL, page: Int? = nil, bounds: [String: Any]? = nil, notify: Bool = false) {
  guard url.pathExtension.lowercased()=="pdf", FileManager.default.fileExists(atPath:url.path), let document=PDFDocument(url:url),document.pageCount>0 else { js("window.marginError","That PDF could not be opened.");return }
  if pdfFindBar != nil, !pdfFindBar.isHidden { hidePDFFind() }
  currentPDF=url;pdfView.document=document;pdfTitle.stringValue=url.lastPathComponent;pdfPane.isHidden=false
  split.setPosition(max(380,window.contentView!.bounds.width * 0.46),ofDividerAt:0)
  if let page, page > 0, let target=document.page(at:min(page-1,document.pageCount-1)) {
   pdfView.go(to:target)
   if let bounds,
      let x=(bounds["x"] as? NSNumber)?.doubleValue,let y=(bounds["y"] as? NSNumber)?.doubleValue,
      let width=(bounds["width"] as? NSNumber)?.doubleValue,let height=(bounds["height"] as? NSNumber)?.doubleValue,
      let selection=target.selection(for:NSRect(x:x,y:y,width:width,height:height)) {
    suppressPDFSelection=true;pdfView.setCurrentSelection(selection,animate:true);pdfView.scrollSelectionToVisible(nil)
    DispatchQueue.main.asyncAfter(deadline:.now()+0.4){self.suppressPDFSelection=false}
   }
  }
  pdfPageChanged()
  if notify { js("window.marginPDFOpened",["path":url.path,"name":url.lastPathComponent,"pages":document.pageCount]) }
 }
 @objc func pdfPageChanged() { guard let document=pdfView.document,let page=pdfView.currentPage else { pdfPage.stringValue="";return };pdfPage.stringValue="\(document.index(for:page)+1) / \(document.pageCount)" }
 @objc func pdfSelectionChanged(){
  let available = !(pdfView.currentSelection?.string?.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ?? true)
  pdfComment.isEnabled=available;pdfSelectionTimer?.invalidate()
  guard available,!suppressPDFSelection else{return}
  pdfSelectionTimer=Timer.scheduledTimer(withTimeInterval:0.28,repeats:false){[weak self] _ in self?.publishPDFSelection()}
 }
 func publishPDFSelection(){
  guard let url=currentPDF,let document=pdfView.document,let selected=pdfView.currentSelection,
        let page=selected.pages.first,let text=selected.string?.trimmingCharacters(in:.whitespacesAndNewlines),!text.isEmpty else{return}
  let box=selected.bounds(for:page)
  js("window.marginPDFSelection",["text":text,"page":document.index(for:page)+1,"path":url.path,"name":url.lastPathComponent,"bounds":["x":box.origin.x,"y":box.origin.y,"width":box.width,"height":box.height]])
 }
 @objc func previousPDFPage(){pdfView.goToPreviousPage(nil)}
 @objc func nextPDFPage(){pdfView.goToNextPage(nil)}
 // Where files come from: Finder, or Foliose. Foliose is asked through a short-lived request file that records what is wanted.
 var awaitingFoliosePDF: Date?
 var pendingPDFPath: String?
 static let foliosePDFBundle = "dev.filepane.FilePane"
 var foliosePDFRequest: URL{FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Margin/foliose-pdf-request")}
 var folioseURL: URL?{NSWorkspace.shared.urlForApplication(withBundleIdentifier:App.foliosePDFBundle)}
 var fileSource: String{
  if let saved=UserDefaults.standard.string(forKey:"fileSource"),["finder","foliose"].contains(saved){return saved}
  return folioseURL != nil ? "foliose" : "finder"
 }
 func folioseRequest(kind:String)->[String:Any]?{
  guard let data=try? Data(contentsOf:foliosePDFRequest),let request=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],request["kind"] as? String == kind,let stamp=request["stamp"] as? Double,Date().timeIntervalSince1970-stamp < 900 else{return nil}
  return request
 }
 func askFoliose(kind:String,subjectID:String="",unitID:String="",notice:String,fallback:@escaping()->Void){
  guard let app=folioseURL else{fallback();return}
  try? FileManager.default.createDirectory(at:foliosePDFRequest.deletingLastPathComponent(),withIntermediateDirectories:true)
  let request:[String:Any]=["kind":kind,"stamp":Date().timeIntervalSince1970,"subjectID":subjectID,"unitID":unitID]
  if let data=try? JSONSerialization.data(withJSONObject:request){try? data.write(to:foliosePDFRequest,options:.atomic)}
  let config=NSWorkspace.OpenConfiguration();config.activates=true
  NSWorkspace.shared.openApplication(at:app,configuration:config){[weak self] _,error in DispatchQueue.main.async{
   guard let self else{return}
   if error != nil{try? FileManager.default.removeItem(at:self.foliosePDFRequest);fallback()}else{self.js("window.marginNotice",notice)}
  }}
 }
 @objc func choosePDF(){if fileSource == "foliose"{choosePDFFromFoliose()}else{choosePDFFromFinder()}}
 @objc func choosePDFFromFoliose(){
  awaitingFoliosePDF=Date()
  askFoliose(kind:"pdf",notice:"Double-click a PDF in Foliose to open it here.",fallback:{[weak self] in self?.awaitingFoliosePDF=nil;self?.choosePDFFromFinder()})
 }
 @objc func choosePDFFromFinder(){let panel=NSOpenPanel();panel.allowedContentTypes=[.pdf];panel.allowsMultipleSelection=false;panel.beginSheetModal(for:window){ response in if response == .OK,let url=panel.url { self.openPDF(url,notify:true) } }}
 @objc func closePDF(){if !pdfFindBar.isHidden{hidePDFFind()};pdfPane.isHidden=true;currentPDF=nil;pdfView.document=nil;js("window.marginPDFClosed",NSNull())}
 func capturePDF(kind:String){
  guard let url=currentPDF,let document=pdfView.document,let page=pdfView.currentPage else{return}
  let pageNumber=document.index(for:page)+1
  let selection=pdfView.currentSelection?.string?.trimmingCharacters(in:.whitespacesAndNewlines) ?? ""
  if kind=="quote" && selection.isEmpty { js("toast","Select text in the PDF first");return }
  var payload:[String:Any]=["kind":kind,"text":selection,"page":pageNumber,"path":url.path,"name":url.lastPathComponent]
  if kind=="quote",let selected=pdfView.currentSelection { let box=selected.bounds(for:page);payload["bounds"]=["x":box.origin.x,"y":box.origin.y,"width":box.width,"height":box.height] }
  js("window.marginPDFCapture",payload)
 }
 @objc func capturePDFQuote(){capturePDF(kind:"quote")}
 var traceView: TraceView?
 var traceForEquation = false
 var traceEquationInline = false
 @objc func startEquationTrace(){traceEquationInline=false;traceForEquation=true;startTrace()}
 @objc func startInlineEquationTrace(){traceEquationInline=true;traceForEquation=true;startTrace()}
 @objc func showEquationMenu(_ sender: NSButton){
  let menu=NSMenu();menu.addItem(withTitle:"Equation on its own line",action:#selector(startEquationTrace),keyEquivalent:"").target=self
  menu.addItem(withTitle:"Inline equation, within a sentence",action:#selector(startInlineEquationTrace),keyEquivalent:"").target=self
  menu.popUp(positioning:nil,at:NSPoint(x:0,y:sender.bounds.height+4),in:sender)
 }
 @objc func startTrace(){
  guard pdfView.document != nil else{js("toast","Open a PDF first");return}
  if traceView != nil{cancelTrace();return}
  let forEquation=traceForEquation,inlineEquation=traceEquationInline;traceForEquation=false;traceEquationInline=false
  let layer=TraceView(frame:pdfView.frame);layer.translatesAutoresizingMaskIntoConstraints=false;pdfPane.addSubview(layer)
  NSLayoutConstraint.activate([layer.leadingAnchor.constraint(equalTo:pdfView.leadingAnchor),layer.trailingAnchor.constraint(equalTo:pdfView.trailingAnchor),layer.topAnchor.constraint(equalTo:pdfView.topAnchor),layer.bottomAnchor.constraint(equalTo:pdfView.bottomAnchor)])
  layer.equationMode=forEquation;layer.onFinish={[weak self] points,rectangle in self?.finishTrace(points,rectangle,equation:forEquation,inline:inlineEquation)};layer.onCancel={[weak self] in self?.cancelTrace()}
  traceView=layer;window.makeFirstResponder(layer)
 }
 func cancelTrace(){traceView?.removeFromSuperview();traceView=nil;window.makeFirstResponder(pdfView)}
 func finishTrace(_ points:[CGPoint],_ rectangle:Bool,equation:Bool=false,inline:Bool=false){
  guard let layer=traceView,let document=pdfView.document,let url=currentPDF else{return}
  var traced=points
  let rectangle = rectangle || equation
  if rectangle,let first=points.first,let last=points.last{traced=[first,CGPoint(x:last.x,y:first.y),last,CGPoint(x:first.x,y:last.y)]}
  // The page under the middle of the stroke owns the figure; convert every point into that page's coordinates.
  let middle=pdfView.convert(points[points.count/2],from:layer)
  guard let page=pdfView.page(for:middle,nearest:true) else{cancelTrace();js("toast","Trace inside a PDF page");return}
  let pagePoints=traced.map{pdfView.convert(pdfView.convert($0,from:layer),to:page)}
  cancelTrace()
  let path=CGMutablePath();path.move(to:pagePoints[0]);for point in pagePoints.dropFirst(){path.addLine(to:point)};path.closeSubpath()
  let box=path.boundingBox.insetBy(dx:-4,dy:-4).intersection(page.bounds(for:.cropBox))
  guard box.width>12,box.height>12 else{js("toast","That area is too small to capture");return}
  var scale=min(4,2200/max(box.width,box.height)),png:Data?=nil
  for _ in 0..<5{
   png=renderTrace(page:page,box:box,path:rectangle ? nil : path,scale:scale)
   if let data=png,data.count<1_800_000{break}
   scale*=0.7;png=nil
  }
  guard let data=png else{js("toast","That area is too large to import. Trace a smaller part.");return}
  window.makeFirstResponder(web)
  var payload:[String:Any]=["dataURL":"data:image/png;base64,"+data.base64EncodedString(),"page":document.index(for:page)+1,"name":url.lastPathComponent,"path":url.path]
  if equation{
   payload["inline"]=inline
   if box.width/max(box.height,1) > 9 { js("window.marginNotice","Long equations read best in pieces: trace part of it at a time.") }
   recognizeEquation(png:data,payload:payload)
  }else{js("window.marginPDFImage",payload)}
 }
 // Offline equation recognition: a small model in a private Python environment (see scripts/setup-latex-ocr.sh).
 var latexPython: URL{FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Margin/latex-ocr/venv/bin/python")}
 func recognizeEquation(png:Data,payload:[String:Any]){
  guard FileManager.default.isExecutableFile(atPath:latexPython.path),let script=Bundle.main.path(forResource:"latex_ocr",ofType:"py") else{
   offerEquationSetup(png:png,payload:payload);return
  }
  js("window.marginNotice","Reading the equation…")
  let image=URL(fileURLWithPath:NSTemporaryDirectory()).appendingPathComponent("notival-trace-\(UUID().uuidString).png")
  do{try png.write(to:image)}catch{var result=payload;result["error"]="failed";js("window.marginPDFEquation",result);return}
  DispatchQueue.global(qos:.userInitiated).async{[weak self] in
   let process=Process();process.executableURL=self?.latexPython;process.arguments=[script,image.path]
   let output=Pipe();process.standardOutput=output;process.standardError=FileHandle.nullDevice
   do{try process.run()}catch{DispatchQueue.main.async{var result=payload;result["error"]="failed";self?.js("window.marginPDFEquation",result)};try? FileManager.default.removeItem(at:image);return}
   let watchdog=DispatchWorkItem{if process.isRunning{process.terminate()}};DispatchQueue.global().asyncAfter(deadline:.now()+60,execute:watchdog)
   let data=output.fileHandleForReading.readDataToEndOfFile();process.waitUntilExit();watchdog.cancel()
   try? FileManager.default.removeItem(at:image)
   let last=String(decoding:data,as:UTF8.self).split(separator:"\n").map(String.init).last(where:{!$0.trimmingCharacters(in:.whitespaces).isEmpty}) ?? ""
   let parsed=(try? JSONSerialization.jsonObject(with:Data(last.utf8))) as? [String:Any]
   DispatchQueue.main.async{
    var result=payload
    if let parsed,parsed["ok"] as? Bool == true,let latex=parsed["latex"] as? String,!latex.isEmpty{result["latex"]=latex;result["uncertain"]=parsed["uncertain"] as? Bool ?? false;result["candidates"]=(parsed["candidates"] as? [String]) ?? [latex]}
    else{result["error"]=(parsed?["error"] as? String) ?? "failed"}
    // A broken or half-finished install gets the same offer as no install at all.
    if result["error"] as? String == "setup"{self?.offerEquationSetup(png:png,payload:payload);return}
    self?.js("window.marginPDFEquation",result)
   }
  }
 }
 // ---- One-time setup of equation recognition, from inside the app ----
 var setupSheet: NSPanel?
 var setupProcess: Process?
 var suitablePython: URL? {
  for name in ["python3.12","python3.11","python3.13","python3.10"] {
   for directory in ["/opt/homebrew/bin","/usr/local/bin","/usr/bin"] {
    let path = directory + "/" + name
    if FileManager.default.isExecutableFile(atPath: path) { return URL(fileURLWithPath: path) }
   }
  }
  return nil
 }
 func offerEquationSetup(png: Data?, payload: [String:Any]) {
  let alert = NSAlert()
  alert.messageText = "Set up equation recognition?"
  alert.informativeText = "Notival can turn traced equations into LaTeX right on your Mac. This one-time setup downloads about 500 MB and takes a few minutes. It's free, needs an internet connection now, and works offline afterward."
  alert.addButton(withTitle: "Set Up")
  alert.addButton(withTitle: png == nil ? "Not Now" : "Use a Picture Instead")
  alert.beginSheetModal(for: window) { [weak self] response in
   guard let self else { return }
   if response == .alertFirstButtonReturn { self.installEquationRecognition(retry: png.map { ($0, payload) }) }
   else if png != nil { var result = payload; result["error"] = "setup"; self.js("window.marginPDFEquation", result) }
  }
 }
 @objc func setUpEquationRecognition() {
  if FileManager.default.isExecutableFile(atPath: latexPython.path) { js("window.marginNotice", "Equation recognition is already set up. Use the ƒx button in the PDF header."); return }
  offerEquationSetup(png: nil, payload: [:])
 }
 func installEquationRecognition(retry: (Data, [String:Any])?) {
  func fallBack(_ reason: String) { if let retry { var result = retry.1; result["error"] = reason; js("window.marginPDFEquation", result) } }
  guard suitablePython != nil, let script = Bundle.main.path(forResource: "setup-latex-ocr", ofType: "sh") else {
   let alert = NSAlert(); alert.messageText = "Python is needed first"
   alert.informativeText = "Equation recognition runs on Python 3.10 to 3.13. The newest Python is too new for it. Install one with Homebrew, then try again:\n\nbrew install python@3.12"
   alert.addButton(withTitle: "Copy Command"); alert.addButton(withTitle: "OK")
   alert.beginSheetModal(for: window) { response in
    if response == .alertFirstButtonReturn { NSPasteboard.general.clearContents(); NSPasteboard.general.setString("brew install python@3.12", forType: .string) }
   }
   fallBack("python"); return
  }
  // A small sheet with a spinner while the installer works; Cancel stops it.
  let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 430, height: 150), styleMask: [.titled], backing: .buffered, defer: false)
  panel.title = "Equation recognition"
  let title = NSTextField(labelWithString: "Setting up equation recognition…"); title.font = .systemFont(ofSize: 14, weight: .semibold); title.frame = NSRect(x: 24, y: 104, width: 382, height: 20)
  let detail = NSTextField(wrappingLabelWithString: "Downloading and installing, about 500 MB. This takes a few minutes. You can keep using Notival."); detail.textColor = .secondaryLabelColor; detail.frame = NSRect(x: 24, y: 62, width: 382, height: 36)
  let spinner = NSProgressIndicator(frame: NSRect(x: 24, y: 44, width: 382, height: 8)); spinner.style = .bar; spinner.isIndeterminate = true; spinner.startAnimation(nil)
  let cancel = NSButton(title: "Cancel", target: self, action: #selector(cancelEquationSetup)); cancel.bezelStyle = .rounded; cancel.frame = NSRect(x: 326, y: 8, width: 80, height: 28)
  [title, detail, spinner, cancel].forEach { panel.contentView?.addSubview($0) }
  setupSheet = panel; window.beginSheet(panel)
  let log = FileManager.default.temporaryDirectory.appendingPathComponent("notival-equation-setup.log"); FileManager.default.createFile(atPath: log.path, contents: nil)
  let process = Process(); process.executableURL = URL(fileURLWithPath: "/bin/zsh"); process.arguments = [script]
  process.environment = ["HOME": NSHomeDirectory(), "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"]
  if let handle = try? FileHandle(forWritingTo: log) { process.standardOutput = handle; process.standardError = handle }
  setupProcess = process
  process.terminationHandler = { [weak self] finished in
   DispatchQueue.main.async {
    guard let self else { return }
    if let sheet = self.setupSheet { self.window.endSheet(sheet); self.setupSheet = nil }
    let cancelled = finished.terminationReason == .uncaughtSignal
    self.setupProcess = nil
    if finished.terminationStatus == 0 && FileManager.default.isExecutableFile(atPath: self.latexPython.path) {
     self.js("window.marginNotice", "Equation recognition is ready.")
     if let retry { self.recognizeEquation(png: retry.0, payload: retry.1) }
    } else if cancelled {
     fallBack("setup")
    } else {
     let tail = ((try? String(contentsOf: log, encoding: .utf8)) ?? "").split(separator: "\n").suffix(4).joined(separator: "\n")
     let alert = NSAlert(); alert.messageText = "Setup didn't finish"; alert.informativeText = tail.isEmpty ? "Something went wrong while installing. Check your internet connection and try again from File → Set Up Equation Recognition." : tail
     alert.beginSheetModal(for: self.window, completionHandler: nil)
     fallBack("setup")
    }
   }
  }
  do { try process.run() } catch { if let sheet = setupSheet { window.endSheet(sheet); setupSheet = nil }; fallBack("setup") }
 }
 @objc func cancelEquationSetup() { setupProcess?.terminate() }
 // ---- Find in PDF (⌘F) ----
 @objc func showPDFFind() {
  guard pdfPane != nil, !pdfPane.isHidden, pdfView.document != nil else { js("window.marginNotice", "Open a PDF to search it."); return }
  pdfFindHeight.constant = 42; pdfFindBar.isHidden = false
  if let selected = pdfView.currentSelection?.string?.trimmingCharacters(in: .whitespacesAndNewlines), !selected.isEmpty, selected.count < 80, !selected.contains("\n") {
   pdfFindField.stringValue = selected; runFind()
  }
  window.makeFirstResponder(pdfFindField); pdfFindField.selectText(nil)
 }
 @objc func hidePDFFind() {
  pdfFinder.reset(); findRevealed = false; pdfView.highlightedSelections = nil
  pdfFindHeight.constant = 0; pdfFindBar.isHidden = true
  window.makeFirstResponder(pdfView)
 }
 @objc func findNextInPDF() { stepPDFFind(1) }
 @objc func findPreviousInPDF() { stepPDFFind(-1) }
 func runFind() {
  guard let document = pdfView.document else { return }
  findRevealed = false
  pdfFinder.onChange = { [weak self] in self?.scheduleFindUpdate() }
  pdfFinder.search(pdfFindField.stringValue, in: document)
 }
 func stepPDFFind(_ delta: Int) {
  if pdfFindBar.isHidden { showPDFFind(); return }
  let typed = pdfFindField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
  // Return on new text searches; Return again (or ⌘G) steps through the results.
  if typed != pdfFinder.query { if !typed.isEmpty { runFind() }; return }
  if pdfFinder.matches.isEmpty { return }
  pdfFinder.step(delta); revealCurrentMatch(); updateFindCount()
 }
 // The current match is shown by colour, not by selecting it. Selecting text in the PDF means "quote or comment on this" to the note, which is not what searching is.
 func revealCurrentMatch() {
  guard let match = pdfFinder.current else { return }
  for (position, other) in pdfFinder.matches.enumerated() { other.color = position == pdfFinder.index ? PDFFinder.currentHighlight : PDFFinder.highlight }
  pdfView.highlightedSelections = pdfFinder.matches
  pdfView.go(to: match)
 }
 // Matches stream in while a long PDF is searched. Redrawing for each one is what made big searches crawl, so updates are batched.
 var findUpdatePending = false
 var findRevealed = false
 func scheduleFindUpdate() {
  if !pdfFinder.searching { findUpdatePending = false; updateFindResults(); return }
  guard !findUpdatePending else { return }
  findUpdatePending = true
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
   guard let self, self.findUpdatePending else { return }
   self.findUpdatePending = false; self.updateFindResults()
  }
 }
 func updateFindResults() {
  pdfView.highlightedSelections = pdfFinder.matches.isEmpty ? nil : pdfFinder.matches
  if !pdfFinder.matches.isEmpty, !findRevealed { findRevealed = true; revealCurrentMatch() }
  if pdfFinder.matches.isEmpty { findRevealed = false }
  updateFindCount()
 }
 func updateFindCount() {
  let total = pdfFinder.matches.count
  if pdfFindField.stringValue.trimmingCharacters(in: .whitespaces).isEmpty { pdfFindCount.stringValue = "" }
  else if total == 0 { pdfFindCount.stringValue = pdfFinder.searching ? "Searching…" : "No results" }
  else { pdfFindCount.stringValue = "\(pdfFinder.index + 1) of \(total)\(pdfFinder.capped ? "+" : pdfFinder.searching ? "…" : "")" }
 }
 // Nothing is searched while typing. Return starts the search, so a one-letter query never freezes the viewer; editing the text just clears the old results.
 func controlTextDidChange(_ notification: Notification) {
  guard (notification.object as? NSSearchField) === pdfFindField else { return }
  if pdfFindField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines) != pdfFinder.query { pdfFinder.reset(); pdfView.highlightedSelections = nil; updateFindCount() }
 }
 func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
  guard control === pdfFindField else { return false }
  if commandSelector == #selector(NSResponder.insertNewline(_:)) { stepPDFFind(NSApp.currentEvent?.modifierFlags.contains(.shift) == true ? -1 : 1); return true }
  if commandSelector == #selector(NSResponder.cancelOperation(_:)) { hidePDFFind(); return true }
  return false
 }
 func renderTrace(page:PDFPage,box:CGRect,path:CGPath?,scale:CGFloat)->Data?{
  let width=Int(ceil(box.width*scale)),height=Int(ceil(box.height*scale))
  guard width>0,height>0,let context=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else{return nil}
  context.setFillColor(CGColor(red:1,green:1,blue:1,alpha:1));context.fill(CGRect(x:0,y:0,width:width,height:height))
  context.scaleBy(x:scale,y:scale);context.translateBy(x:-box.minX,y:-box.minY)
  if let path{context.addPath(path);context.clip()}
  page.draw(with:.cropBox,to:context)
  guard let image=context.makeImage() else{return nil}
  return NSBitmapImageRep(cgImage:image).representation(using:.png,properties:[:])
 }
 @objc func capturePDFThought(){capturePDF(kind:"thought")}
 @objc func commentPDFSelection(){
  guard let url=currentPDF,let document=pdfView.document,let selected=pdfView.currentSelection,
        let page=selected.pages.first,let text=selected.string?.trimmingCharacters(in:.whitespacesAndNewlines),!text.isEmpty else {return}
  let input=NSTextField(string:"");input.placeholderString="Write a comment…";input.frame=NSRect(x:0,y:0,width:360,height:28)
  let alert=NSAlert();alert.messageText="Comment on selected text";alert.informativeText=String(text.prefix(240));alert.accessoryView=input;alert.addButton(withTitle:"Add Comment");alert.addButton(withTitle:"Cancel");alert.window.initialFirstResponder=input
  alert.beginSheetModal(for:window){response in
   let comment=input.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)
   guard response == .alertFirstButtonReturn,!comment.isEmpty else{return}
   let box=selected.bounds(for:page),pageNumber=document.index(for:page)+1
   self.js("window.marginPDFCapture",["kind":"comment","text":text,"comment":comment,"page":pageNumber,"path":url.path,"name":url.lastPathComponent,"bounds":["x":box.origin.x,"y":box.origin.y,"width":box.width,"height":box.height]])
  }
 }
 func registerQuickNoteKey() {
  var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
  guard InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
   var identifier = EventHotKeyID()
   guard let event, GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil,
    MemoryLayout<EventHotKeyID>.size, nil, &identifier) == noErr, identifier.signature == 0x4D4E4F54 else { return OSStatus(eventNotHandledErr) }
   DispatchQueue.main.async {
    guard let app = NSApp.delegate as? App else { return }
    app.window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    app.web.evaluateJavaScript("document.querySelector('#new')?.click()", completionHandler: nil)
   }
   return noErr
  }, 1, &event, nil, &quickNoteHandler) == noErr else { return }
  _ = RegisterEventHotKey(UInt32(kVK_ANSI_N), UInt32(controlKey | optionKey | cmdKey),
   EventHotKeyID(signature: 0x4D4E4F54, id: 1), GetApplicationEventTarget(), 0, &quickNoteKey)
 }
 func js(_ name: String, _ value: Any) { guard JSONSerialization.isValidJSONObject([value]), let data = try? JSONSerialization.data(withJSONObject: [value]), let text = String(data: data,encoding: .utf8) else { return }; web.evaluateJavaScript("\(name)(\(text).at(0))", completionHandler: nil) }
 func runProcess(_ executable:String,_ arguments:[String],in directory:URL,timeout:TimeInterval)->(Int32,String,Bool){
  let log=directory.appendingPathComponent(UUID().uuidString+".log");FileManager.default.createFile(atPath:log.path,contents:nil);guard let handle=try? FileHandle(forWritingTo:log) else{return(-1,"Could not capture process output.",false)}
  let process=Process();process.executableURL=URL(fileURLWithPath:executable);process.arguments=arguments;process.currentDirectoryURL=directory;process.environment=["PATH":"/usr/bin:/bin","HOME":directory.path,"TMPDIR":directory.path,"LANG":"en_US.UTF-8"];process.standardOutput=handle;process.standardError=handle
  do{try process.run()}catch{try? handle.close();return(-1,error.localizedDescription,false)}
  let deadline=Date().addingTimeInterval(timeout);while process.isRunning&&Date()<deadline{Thread.sleep(forTimeInterval:0.02)};let timedOut=process.isRunning;if timedOut{process.terminate()};process.waitUntilExit();try? handle.close();let data=(try? Data(contentsOf:log)) ?? Data();try? FileManager.default.removeItem(at:log);return(process.terminationStatus,String(decoding:data.prefix(48_000),as:UTF8.self),timedOut)
 }
 func runC(_ body:[String:Any]){
  guard let requestID=body["requestID"] as? String,let code=body["code"] as? String,code.utf8.count<=100_000 else{return}
  DispatchQueue.global(qos:.userInitiated).async{let temporary=FileManager.default.temporaryDirectory.path,root=URL(fileURLWithPath:temporary.hasPrefix("/var/") ? "/private"+temporary : temporary,isDirectory:true),folder=root.appendingPathComponent("margin-c-"+UUID().uuidString);defer{try? FileManager.default.removeItem(at:folder)}
   do{try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true);let source=folder.appendingPathComponent("main.c"),binary=folder.appendingPathComponent("program");try code.write(to:source,atomically:true,encoding:.utf8)
    let compiled=self.runProcess("/usr/bin/xcrun",["clang",source.path,"-std=c17","-Wall","-Wextra","-o",binary.path],in:folder,timeout:8);if compiled.2||compiled.0 != 0{DispatchQueue.main.async{self.js("window.marginNativeRunResult",["requestID":requestID,"text":compiled.2 ? "Compilation stopped after 8 seconds." : compiled.1,"error":true])};return}
    let result=self.runProcess(binary.path,[],in:folder,timeout:3);let output=result.1.isEmpty && result.0 != 0 ? "Program exited with status \(result.0)." : result.1;DispatchQueue.main.async{self.js("window.marginNativeRunResult",["requestID":requestID,"text":result.2 ? "Stopped after 3 seconds. Check for an infinite loop." : output,"error":result.2||result.0 != 0])}
   }catch{DispatchQueue.main.async{self.js("window.marginNativeRunResult",["requestID":requestID,"text":error.localizedDescription,"error":true])}}
  }
 }
 func runPython(_ body:[String:Any]){
  guard let requestID=body["requestID"] as? String,let code=body["code"] as? String,code.utf8.count<=100_000 else{return}
  DispatchQueue.global(qos:.userInitiated).async{let temporary=FileManager.default.temporaryDirectory.path,root=URL(fileURLWithPath:temporary.hasPrefix("/var/") ? "/private"+temporary : temporary,isDirectory:true),folder=root.appendingPathComponent("margin-python-"+UUID().uuidString);defer{try? FileManager.default.removeItem(at:folder)}
   do{try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true);let source=folder.appendingPathComponent("main.py");try code.write(to:source,atomically:true,encoding:.utf8);let candidates=["/usr/bin/python3","/opt/homebrew/bin/python3","/usr/local/bin/python3"],python=candidates.first(where:{FileManager.default.isExecutableFile(atPath:$0)});guard let python else{throw NSError(domain:"Margin",code:1,userInfo:[NSLocalizedDescriptionKey:"Python 3 was not found. Install Python 3 or Apple Command Line Tools, then try again."])}
    let result=self.runProcess(python,["-I","-B",source.path],in:folder,timeout:3);let output=result.1.isEmpty && result.0 != 0 ? "Python exited with status \(result.0)." : result.1;DispatchQueue.main.async{self.js("window.marginNativeRunResult",["requestID":requestID,"text":result.2 ? "Stopped after 3 seconds. Check for an infinite loop." : output,"error":result.2||result.0 != 0])}
   }catch{DispatchQueue.main.async{self.js("window.marginNativeRunResult",["requestID":requestID,"text":error.localizedDescription,"error":true])}}
  }
 }
 func importMaterials(_ urls:[URL], subjectID:String, unitID:String) {
  guard !subjectID.isEmpty else {js("window.marginError","Choose a subject for these files.");return}
  let directory=storage.deletingLastPathComponent().appendingPathComponent("Materials",isDirectory:true)
  DispatchQueue.global(qos:.userInitiated).async {
   var files=[[String:String]]();var failures=[String]()
   do {try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)}catch{DispatchQueue.main.async{self.js("window.marginError",error.localizedDescription)};return}
   for original in urls.prefix(100) {
    let url=original.resolvingSymlinksInPath()
    guard url.isFileURL else{continue}
    do {
     let info=try url.resourceValues(forKeys:[.isDirectoryKey])
     if info.isDirectory == true && !["pages","numbers","key","rtfd"].contains(url.pathExtension.lowercased()){failures.append(original.lastPathComponent);continue}
     let target=directory.appendingPathComponent(UUID().uuidString+"-"+original.lastPathComponent)
     try FileManager.default.copyItem(at:url,to:target);files.append(["name":original.lastPathComponent,"path":target.path])
    }catch{failures.append(original.lastPathComponent)}
   }
   let imported=files,skipped=failures
   DispatchQueue.main.async {
    self.js("window.marginMaterialsAttached",["subjectID":subjectID,"unitID":unitID,"files":imported] as [String:Any])
    if !skipped.isEmpty{self.js("window.marginError","Could not attach: "+skipped.joined(separator:", "))}
   }
  }
 }
 func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
  guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
  do {
   switch type {
   case "ready":
    let data = try? Data(contentsOf: storage); let state = data.flatMap { try? JSONSerialization.jsonObject(with: $0) }
    if data != nil && state == nil { js("window.marginError", "Notes could not be read. Original file preserved."); return }
    js("window.marginLoad", state ?? NSNull()); ready = true
    web.evaluateJavaScript("requestAnimationFrame(()=>requestAnimationFrame(()=>window.notivalReplayLaunch?.()))",completionHandler:nil)
    let importScan = FolioseImporter.notes()
    js("window.marginImportFoliose", importScan.items)
    if importScan.skipped > 0 { js("window.marginImportWarning", "\(importScan.skipped) Foliose note record(s) could not be imported. Their originals were left untouched.") }
    if let capture = pending { js("window.marginCapture",capture); pending = nil }
    if let path = pendingPDFPath { openPDF(URL(fileURLWithPath:path),notify:true); pendingPDFPath = nil }
   case "save":
    guard ready, let state = body["state"] as? [String: Any], state["notes"] is [Any] else { return }
    let data = try JSONSerialization.data(withJSONObject: state, options: [.prettyPrinted,.sortedKeys]); try FileManager.default.createDirectory(at: storage.deletingLastPathComponent(),withIntermediateDirectories: true)
    if FileManager.default.fileExists(atPath: storage.path) {
     let backup = storage.appendingPathExtension("bak")
     try? FileManager.default.removeItem(at: backup)
     try FileManager.default.copyItem(at: storage, to: backup)
    }
    try data.write(to: storage,options: .atomic); web.evaluateJavaScript("window.marginSaved()",completionHandler: nil)
   case "copy": NSPasteboard.general.clearContents(); NSPasteboard.general.setString(body["text"] as? String ?? "",forType: .string); js("toast","Snippet copied")
   case "runCode": if body["language"] as? String == "c" { runC(body) } else if body["language"] as? String == "python" { runPython(body) }
   case "revealFile":
    guard let path = body["path"] as? String, path.hasPrefix("/"), FileManager.default.fileExists(atPath: path) else {
     js("window.marginError", "That linked file is no longer available."); return
    }
    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
   case "openURL":
    guard let raw = body["url"] as? String, let url = URL(string: raw),
          ["https", "http", "mailto", "file"].contains(url.scheme?.lowercased() ?? "") else { return }
    if url.isFileURL {
     guard FileManager.default.fileExists(atPath: url.path) else { js("window.marginError", "That linked file is no longer available."); return }
    }
    NSWorkspace.shared.open(url)
   case "exportNote":
    let format = body["format"] as? String == "docx" ? "docx" : "pdf"
    let panel = NSSavePanel(); panel.canCreateDirectories = true
    panel.allowedContentTypes = [format == "docx" ? (UTType(filenameExtension: "docx") ?? .data) : .pdf]
    panel.nameFieldStringValue = NoteExporter.suggestedName(body["title"] as? String ?? "") + "." + format
    let html = body["html"] as? String ?? ""
    let resources = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    panel.beginSheetModal(for: window) { response in
     guard response == .OK, let url = panel.url else { return }
     self.noteExporter.save(html: html, format: format, to: url, resources: resources) { error in
      if let error { self.js("window.marginError", error.localizedDescription) } else { NSWorkspace.shared.activateFileViewerSelecting([url]); self.js("toast", "Exported “\(url.lastPathComponent)”") }
     }
    }
   case "exportGuide":
    let panel = NSSavePanel(); panel.canCreateDirectories = true
    panel.allowedContentTypes = [.pdf]
    panel.nameFieldStringValue = NoteExporter.suggestedName(body["title"] as? String ?? "Study guide") + ".pdf"
    let html = body["html"] as? String ?? "", pdfs = body["pdfs"] as? [String] ?? []
    let resources = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    panel.beginSheetModal(for: window) { response in
     guard response == .OK, let url = panel.url else { return }
     self.noteExporter.save(html: html, format: "pdf", to: url, resources: resources) { error in
      if let error { self.js("window.marginError", error.localizedDescription); return }
      let added = NoteExporter.append(pdfs: pdfs, to: url)
      NSWorkspace.shared.activateFileViewerSelecting([url])
      self.js("toast", pdfs.isEmpty || added == pdfs.count ? "Saved “\(url.lastPathComponent)”" : "Saved “\(url.lastPathComponent)” — \(pdfs.count - added) PDF(s) couldn’t be added")
     }
    }
   case "export":
    let panel = NSSavePanel(); panel.nameFieldStringValue = "notival-notes.json"; panel.beginSheetModal(for: window) { response in if response == .OK, let url = panel.url { do { try (body["text"] as? String ?? "").write(to: url,atomically: true,encoding: .utf8) } catch { self.js("window.marginError", error.localizedDescription) } } }
   case "import":
    let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false
    panel.beginSheetModal(for: window) { response in
     guard response == .OK, let url = panel.url else { return }
     do {
      let data = try Data(contentsOf: url)
      guard data.count <= 20_000_000, let backup = try JSONSerialization.jsonObject(with: data) as? [String: Any], backup["notes"] is [[String: Any]] else {
       self.js("window.marginError", "Choose a Notival JSON backup smaller than 20 MB."); return
      }
      self.js("window.marginImportBackup", backup)
     } catch { self.js("window.marginError", error.localizedDescription) }
    }
   case "attachMaterials":
    let subjectID=body["subjectID"] as? String ?? "",unitID=body["unitID"] as? String ?? ""
    let finder={[weak self] in
     guard let self else{return}
     let panel=NSOpenPanel();panel.canChooseFiles=true;panel.canChooseDirectories=false;panel.allowsMultipleSelection=true;panel.prompt="Attach Materials"
     panel.beginSheetModal(for:self.window){response in if response == .OK {self.importMaterials(panel.urls,subjectID:subjectID,unitID:unitID)}}
    }
    if fileSource == "foliose"{askFoliose(kind:"materials",subjectID:subjectID,unitID:unitID,notice:"Double-click a file in Foliose to attach it, or select several and use Send to Notival.",fallback:finder)}else{finder()}
   case "theme":
    func colour(_ key: String) -> NSColor? { (body[key] as? String).flatMap(NSColor.init(hex:)) }
    if let background = colour("background"), let ink = colour("ink"), let muted = colour("muted"), let line = colour("line"), let soft = colour("soft"), let accent = colour("accent") {
     theme = NotivalTheme(background: background, ink: ink, muted: muted, line: line, soft: soft, accent: accent, dark: body["dark"] as? Bool ?? false)
     applyPDFTheme()
    }
   case "canvasSecret":
    let base = body["base"] as? String ?? ""
    if body["action"] as? String == "clear" { CanvasKeychain.delete(base: base); js("window.marginCanvasSecretSaved", ["ok": true, "action": "clear"]) }
    else if let secret = body["secret"] as? String, !secret.isEmpty, let url = CanvasClient.allowedFeed(secret), CanvasClient.origin(of: url) == base { js("window.marginCanvasSecretSaved", ["ok": CanvasKeychain.set(secret: secret, base: base), "action": "set"]) }
    else { js("window.marginCanvasSecretSaved", ["ok": false, "action": "set"]) }
   case "canvasFeed":
    let requestID = body["id"] as? Int ?? 0
    let finish: (CanvasResponse?, String?) -> Void = { [weak self] response, error in
     DispatchQueue.main.async {
      if let response { self?.js("window.marginCanvasResponse", ["id": requestID, "status": response.status, "body": response.body]) }
      else { self?.js("window.marginCanvasResponse", ["id": requestID, "error": error ?? "Request failed."]) }
     }
    }
    if let link = body["url"] as? String { CanvasClient.get(link: link, completion: finish) }
    else { CanvasClient.getSaved(base: body["base"] as? String ?? "", completion: finish) }
   case "setFileSource":
    if let value=body["value"] as? String,["finder","foliose"].contains(value){UserDefaults.standard.set(value,forKey:"fileSource")}
   case "importDroppedFiles":
    let board=NSPasteboard(name:.drag)
    let urls=(board.readObjects(forClasses:[NSURL.self],options:[.urlReadingFileURLsOnly:true]) as? [URL]) ?? []
    guard !urls.isEmpty else{js("window.marginError","The drop did not contain readable local files. Use Attach materials instead.");return}
    importMaterials(urls,subjectID:body["subjectID"] as? String ?? "",unitID:body["unitID"] as? String ?? "")
   case "openPDF":
    choosePDF()
   case "addDrawing": beginDrawing(body)
   case "chooseProjectFolder":
    let panel=NSOpenPanel();panel.canChooseDirectories=true;panel.canChooseFiles=false;panel.allowsMultipleSelection=false;panel.prompt="Connect Folder"
    panel.beginSheetModal(for:window){response in if response == .OK,let url=panel.url { self.js("window.marginProjectFolderChosen",["path":url.path,"name":url.lastPathComponent]) } }
   case "revealProject":
    guard let path=body["path"] as? String,path.hasPrefix("/"),FileManager.default.fileExists(atPath:path) else {js("window.marginError","That project folder is no longer available.");return}
    NSWorkspace.shared.open(URL(fileURLWithPath:path))
   case "showPDF":
    guard let path=body["path"] as? String,path.hasPrefix("/") else{return}
    openPDF(URL(fileURLWithPath:path),page:body["page"] as? Int)
   case "jumpPDF":
    guard let path=body["path"] as? String,path.hasPrefix("/") else{return}
    openPDF(URL(fileURLWithPath:path),page:body["page"] as? Int,bounds:body["bounds"] as? [String:Any])
   case "closePDF": closePDF()
   case "capturePDF": capturePDF(kind:body["kind"] as? String ?? "quote")
   case "showPDFHighlights":
    guard let document=pdfView.document,let items=body["highlights"] as? [[String:Any]] else{return}
    for index in 0..<document.pageCount { if let page=document.page(at:index) { for annotation in page.annotations where ["Margin","Notival"].contains(annotation.userName ?? "") { page.removeAnnotation(annotation) } } }
    for item in items {
     guard let number=item["page"] as? Int,let page=document.page(at:number-1),let bounds=item["bounds"] as? [String:Any],
           let x=(bounds["x"] as? NSNumber)?.doubleValue,let y=(bounds["y"] as? NSNumber)?.doubleValue,
           let width=(bounds["width"] as? NSNumber)?.doubleValue,let height=(bounds["height"] as? NSNumber)?.doubleValue else{continue}
     let annotation=PDFAnnotation(bounds:NSRect(x:x,y:y,width:width,height:height),forType:.highlight,withProperties:nil);annotation.color=NSColor.systemYellow.withAlphaComponent(0.38);annotation.userName="Notival";page.addAnnotation(annotation)
    }
   case "reveal", "comment":
    let data = try JSONSerialization.data(withJSONObject: body); var parts = URLComponents(); parts.scheme = "vscode"; parts.host = "margin.margin-companion"; parts.path = "/action"; parts.queryItems = [URLQueryItem(name:"payload",value:data.base64EncodedString())]
    if let url = parts.url { NSWorkspace.shared.open(url) }
   default: break
   }
  } catch { js("window.marginError",error.localizedDescription) }
 }
 // WebKit delegates JavaScript dialogs to the desktop host.
 func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
  let alert = NSAlert(); alert.messageText = prompt
  let input = NSTextField(string: defaultText ?? ""); input.frame = NSRect(x: 0, y: 0, width: 320, height: 26)
  alert.accessoryView = input; alert.addButton(withTitle: "Save"); alert.addButton(withTitle: "Cancel")
  alert.window.initialFirstResponder = input
  alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn ? input.stringValue : nil) }
 }
 func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
  let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Continue"); alert.addButton(withTitle: "Cancel")
  alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn) }
 }
 func application(_ application: NSApplication, open urls: [URL]) {
  for url in urls where ["margin","notival"].contains(url.scheme ?? "") && url.host == "openpdf" {
   guard folioseRequest(kind:"pdf") != nil,let path=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name == "path"})?.value,path.hasPrefix("/"),path.lowercased().hasSuffix(".pdf"),FileManager.default.fileExists(atPath:path) else{continue}
   awaitingFoliosePDF=nil;try? FileManager.default.removeItem(at:foliosePDFRequest)
   if ready{openPDF(URL(fileURLWithPath:path),notify:true)}else{pendingPDFPath=path}
  }
  // Files chosen in Foliose for Attach materials; the subject and unit come from the request Notival wrote, not from the URL.
  for url in urls where ["margin","notival"].contains(url.scheme ?? "") && url.host == "attach" {
   guard let request=folioseRequest(kind:"materials"),let value=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name == "payload"})?.value,let data=Data(base64Encoded:value),data.count < 200_000,let body=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let paths=body["paths"] as? [String] else{continue}
   let files=paths.filter{$0.hasPrefix("/") && FileManager.default.fileExists(atPath:$0)}.prefix(100).map{URL(fileURLWithPath:$0)}
   guard !files.isEmpty else{continue}
   try? FileManager.default.removeItem(at:foliosePDFRequest)
   importMaterials(Array(files),subjectID:request["subjectID"] as? String ?? "",unitID:request["unitID"] as? String ?? "")
  }
  for url in urls where ["margin","notival"].contains(url.scheme ?? "") && url.host == "capture" {
   guard let value = URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name == "payload"})?.value, let data = Data(base64Encoded:value), data.count < 1_000_000, let capture = (try? JSONSerialization.jsonObject(with:data)) as? [String:Any],
         capture["text"] is String || capture["paths"] is [String] else { continue }
   // A single PDF sent from Foliose right after Open PDF opens as a PDF workspace instead of a link note.
   if let asked=awaitingFoliosePDF,Date().timeIntervalSince(asked) < 900,let paths=capture["paths"] as? [String],paths.count == 1,paths[0].lowercased().hasSuffix(".pdf"),FileManager.default.fileExists(atPath:paths[0]){
    awaitingFoliosePDF=nil;openPDF(URL(fileURLWithPath:paths[0]),notify:true);continue
   }
   if ready { js("window.marginCapture",capture) } else { pending = capture }
  }
  window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
 }
 @objc func formatNoteText(_ sender:NSMenuItem){js("window.notivalFormat",sender.representedObject as? String ?? "bold")}
 func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil);web.evaluateJavaScript("requestAnimationFrame(()=>window.notivalReplayLaunch?.())",completionHandler:nil); return true }
 func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) { decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel) }
}
if CommandLine.arguments.contains("--check-foliose-import") {
 let scan = FolioseImporter.notes()
 let active = scan.items.filter { $0["deletedAt"] == nil }.count
 let trash = scan.items.count - active
 print("Foliose import: \(active) active, \(trash) in Trash, \(scan.skipped) unreadable")
 exit(scan.skipped == 0 ? 0 : 1)
}
if CommandLine.arguments.contains("--check-pdf") {
 let source=PDFDocument();source.insert(PDFPage(),at:0)
 guard let data=source.dataRepresentation(),let document=PDFDocument(data:data),document.pageCount==1 else { print("PDF check failed");exit(1) }
 print("PASS: PDFKit creates, serializes, and reopens a PDF page.");exit(0)
}
let app = NSApplication.shared
let delegate = App(); app.delegate = delegate; app.setActivationPolicy(.regular); app.run()
