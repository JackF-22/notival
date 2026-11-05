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

final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
 var window: NSWindow!
 var web: WKWebView!
 var split: NSSplitView!
 var pdfPane: NSView!
 var pdfView: PDFView!
 var pdfTitle: NSTextField!
 var pdfPage: NSTextField!
 var pdfComment: NSButton!
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
  let appMenu = NSMenu(); appMenu.addItem(withTitle: "About Margin", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
  appMenu.addItem(.separator()); appMenu.addItem(withTitle: "Quit Margin", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"); item.submenu = appMenu
  let fileItem=NSMenuItem();menu.addItem(fileItem);let fileMenu=NSMenu(title:"File");fileItem.submenu=fileMenu
  let openPDFItem=fileMenu.addItem(withTitle:"Open PDF…",action:#selector(choosePDF),keyEquivalent:"o");openPDFItem.target=self
  let deviceItem=NSMenuItem(title:"Insert from iPad",action:nil,keyEquivalent:"");deviceItem.identifier=NSMenuItem.importFromDeviceIdentifier;fileMenu.addItem(deviceItem)
  fileMenu.addItem(.separator())
  let quoteItem=fileMenu.addItem(withTitle:"Capture PDF Quote",action:#selector(capturePDFQuote),keyEquivalent:"q");quoteItem.keyEquivalentModifierMask=[.command,.shift];quoteItem.target=self
  let thoughtItem=fileMenu.addItem(withTitle:"Add PDF Page Thought",action:#selector(capturePDFThought),keyEquivalent:"p");thoughtItem.keyEquivalentModifierMask=[.command,.shift];thoughtItem.target=self
  let editItem = NSMenuItem(); menu.addItem(editItem); let edit = NSMenu(title: "Edit"); editItem.submenu = edit
  for (title, action, key) in [("Undo", "undo:", "z"),("Redo", "redo:", "Z"),("Cut", "cut:", "x"),("Copy", "copy:", "c"),("Paste", "paste:", "v"),("Select All", "selectAll:", "a")] { edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key) }
  NSApp.mainMenu = menu
  let config = WKWebViewConfiguration(); config.userContentController.add(self, name: "margin")
  web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self; web.uiDelegate = self
  configurePDFPane()
  split = NSSplitView(frame: .zero); split.isVertical = true; split.dividerStyle = .thin
  split.addArrangedSubview(pdfPane); split.addArrangedSubview(web); pdfPane.isHidden = true
  window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 1120,height: 790),styleMask: [.titled,.closable,.miniaturizable,.resizable],backing: .buffered,defer: false)
  window.title = "Margin"; window.minSize = NSSize(width: 720,height: 520); window.contentView = split; window.center(); window.setFrameAutosaveName("MarginMain"); window.isReleasedWhenClosed = false
  let url = Bundle.main.resourceURL!.appendingPathComponent("web/index.html")
  web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
  registerQuickNoteKey()
 }
 func configurePDFPane() {
  pdfPane = NSView(frame: .zero)
  let bar = NSView(frame: .zero); bar.translatesAutoresizingMaskIntoConstraints = false
  pdfView = PDFView(frame: .zero); pdfView.translatesAutoresizingMaskIntoConstraints = false; pdfView.autoScales = true
  pdfView.displayMode = .singlePageContinuous; pdfView.displayDirection = .vertical; pdfView.displaysPageBreaks = true
  pdfTitle = NSTextField(labelWithString: "PDF"); pdfTitle.translatesAutoresizingMaskIntoConstraints = false; pdfTitle.lineBreakMode = .byTruncatingMiddle
  pdfPage = NSTextField(labelWithString: ""); pdfPage.translatesAutoresizingMaskIntoConstraints = false; pdfPage.alignment = .center
  func button(_ title: String, _ action: Selector, _ tip: String) -> NSButton { let item=NSButton(title:title,target:self,action:action);item.translatesAutoresizingMaskIntoConstraints=false;item.bezelStyle = .rounded;item.toolTip=tip;return item }
  let previous=button("‹",#selector(previousPDFPage),"Previous page")
  let next=button("›",#selector(nextPDFPage),"Next page")
  let quote=button("Quote",#selector(capturePDFQuote),"Add selected text to this note · ⌘⇧Q")
  pdfComment=button("Comment",#selector(commentPDFSelection),"Comment on the selected PDF text");pdfComment.isEnabled=false
  let thought=button("Thought",#selector(capturePDFThought),"Add a thought linked to this page · ⌘⇧P")
  let close=button("×",#selector(closePDF),"Close PDF pane")
  [pdfTitle,previous,pdfPage,next,quote,pdfComment,thought,close].compactMap{$0}.forEach{bar.addSubview($0)}
  pdfPane.addSubview(bar); pdfPane.addSubview(pdfView)
  NSLayoutConstraint.activate([
   bar.leadingAnchor.constraint(equalTo:pdfPane.leadingAnchor,constant:8),bar.trailingAnchor.constraint(equalTo:pdfPane.trailingAnchor,constant:-8),bar.topAnchor.constraint(equalTo:pdfPane.topAnchor),bar.heightAnchor.constraint(equalToConstant:48),
   pdfTitle.leadingAnchor.constraint(equalTo:bar.leadingAnchor,constant:4),pdfTitle.centerYAnchor.constraint(equalTo:bar.centerYAnchor),pdfTitle.widthAnchor.constraint(greaterThanOrEqualToConstant:80),
   previous.leadingAnchor.constraint(greaterThanOrEqualTo:pdfTitle.trailingAnchor,constant:6),previous.centerYAnchor.constraint(equalTo:bar.centerYAnchor),
   pdfPage.leadingAnchor.constraint(equalTo:previous.trailingAnchor,constant:2),pdfPage.centerYAnchor.constraint(equalTo:bar.centerYAnchor),pdfPage.widthAnchor.constraint(equalToConstant:52),
   next.leadingAnchor.constraint(equalTo:pdfPage.trailingAnchor,constant:2),next.centerYAnchor.constraint(equalTo:bar.centerYAnchor),
   quote.leadingAnchor.constraint(equalTo:next.trailingAnchor,constant:8),quote.centerYAnchor.constraint(equalTo:bar.centerYAnchor),
   pdfComment.leadingAnchor.constraint(equalTo:quote.trailingAnchor,constant:5),pdfComment.centerYAnchor.constraint(equalTo:bar.centerYAnchor),
   thought.leadingAnchor.constraint(equalTo:pdfComment.trailingAnchor,constant:5),thought.centerYAnchor.constraint(equalTo:bar.centerYAnchor),
   close.leadingAnchor.constraint(equalTo:thought.trailingAnchor,constant:5),close.trailingAnchor.constraint(equalTo:bar.trailingAnchor),close.centerYAnchor.constraint(equalTo:bar.centerYAnchor),
   pdfView.leadingAnchor.constraint(equalTo:pdfPane.leadingAnchor),pdfView.trailingAnchor.constraint(equalTo:pdfPane.trailingAnchor),pdfView.topAnchor.constraint(equalTo:bar.bottomAnchor),pdfView.bottomAnchor.constraint(equalTo:pdfPane.bottomAnchor)
  ])
  NotificationCenter.default.addObserver(self,selector:#selector(pdfPageChanged),name:Notification.Name.PDFViewPageChanged,object:pdfView)
  NotificationCenter.default.addObserver(self,selector:#selector(pdfSelectionChanged),name:Notification.Name.PDFViewSelectionChanged,object:pdfView)
 }
 func beginDrawing(_ request:[String:Any]){
  guard drawingSheet==nil,let requestID=request["requestID"] as? String else{return}
  let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:470,height:230),styleMask:[.titled],backing:.buffered,defer:false);panel.title="Nearby iPads"
  let capture=SketchCaptureView(frame:NSRect(x:0,y:0,width:470,height:230));panel.contentView=capture
  let title=NSTextField(labelWithString:"Draw on iPad. Continue here.");title.font = .systemFont(ofSize:20,weight:.semibold);title.frame=NSRect(x:24,y:178,width:422,height:28)
  let detail=NSTextField(wrappingLabelWithString:"Margin now opens Apple’s nearby-device list automatically. Select an iPad and choose Add Sketch; tapping Done on iPad inserts it at your saved note position.\n\nNotability and Notes drawings can still be imported as images.");detail.frame=NSRect(x:24,y:88,width:422,height:76)
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
 @objc func choosePDF(){let panel=NSOpenPanel();panel.allowedContentTypes=[.pdf];panel.allowsMultipleSelection=false;panel.beginSheetModal(for:window){ response in if response == .OK,let url=panel.url { self.openPDF(url,notify:true) } }}
 @objc func closePDF(){pdfPane.isHidden=true;currentPDF=nil;pdfView.document=nil;js("window.marginPDFClosed",NSNull())}
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
 func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
  guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
  do {
   switch type {
   case "ready":
    let data = try? Data(contentsOf: storage); let state = data.flatMap { try? JSONSerialization.jsonObject(with: $0) }
    if data != nil && state == nil { js("window.marginError", "Notes could not be read. Original file preserved."); return }
    js("window.marginLoad", state ?? NSNull()); ready = true
    let importScan = FolioseImporter.notes()
    js("window.marginImportFoliose", importScan.items)
    if importScan.skipped > 0 { js("window.marginImportWarning", "\(importScan.skipped) Foliose note record(s) could not be imported. Their originals were left untouched.") }
    if let capture = pending { js("window.marginCapture",capture); pending = nil }
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
   case "export":
    let panel = NSSavePanel(); panel.nameFieldStringValue = "margin-notes.json"; panel.beginSheetModal(for: window) { response in if response == .OK, let url = panel.url { do { try (body["text"] as? String ?? "").write(to: url,atomically: true,encoding: .utf8) } catch { self.js("window.marginError", error.localizedDescription) } } }
   case "import":
    let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false
    panel.beginSheetModal(for: window) { response in
     guard response == .OK, let url = panel.url else { return }
     do {
      let data = try Data(contentsOf: url)
      guard data.count <= 20_000_000, let backup = try JSONSerialization.jsonObject(with: data) as? [String: Any], backup["notes"] is [[String: Any]] else {
       self.js("window.marginError", "Choose a Margin JSON backup smaller than 20 MB."); return
      }
      self.js("window.marginImportBackup", backup)
     } catch { self.js("window.marginError", error.localizedDescription) }
    }
   case "attachMaterials":
    let panel=NSOpenPanel();panel.canChooseFiles=true;panel.canChooseDirectories=false;panel.allowsMultipleSelection=true;panel.prompt="Attach Materials"
    panel.beginSheetModal(for:window){response in
     guard response == .OK else{return}
     var files=[[String:String]]();var failures=[String]()
     let directory=self.storage.deletingLastPathComponent().appendingPathComponent("Materials",isDirectory:true)
     do {try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)}catch{self.js("window.marginError",error.localizedDescription);return}
     for url in panel.urls {
      let target=directory.appendingPathComponent(UUID().uuidString+"-"+url.lastPathComponent)
      do {try FileManager.default.copyItem(at:url,to:target);files.append(["name":url.lastPathComponent,"path":target.path])}catch{failures.append(url.lastPathComponent)}
     }
     self.js("window.marginMaterialsAttached",["subjectID":body["subjectID"] as? String ?? "","unitID":body["unitID"] as? String ?? "","files":files] as [String:Any])
     if !failures.isEmpty{self.js("window.marginError","Could not attach: "+failures.joined(separator:", "))}
    }
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
    for index in 0..<document.pageCount { if let page=document.page(at:index) { for annotation in page.annotations where annotation.userName=="Margin" { page.removeAnnotation(annotation) } } }
    for item in items {
     guard let number=item["page"] as? Int,let page=document.page(at:number-1),let bounds=item["bounds"] as? [String:Any],
           let x=(bounds["x"] as? NSNumber)?.doubleValue,let y=(bounds["y"] as? NSNumber)?.doubleValue,
           let width=(bounds["width"] as? NSNumber)?.doubleValue,let height=(bounds["height"] as? NSNumber)?.doubleValue else{continue}
     let annotation=PDFAnnotation(bounds:NSRect(x:x,y:y,width:width,height:height),forType:.highlight,withProperties:nil);annotation.color=NSColor.systemYellow.withAlphaComponent(0.38);annotation.userName="Margin";page.addAnnotation(annotation)
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
  for url in urls where url.scheme == "margin" && url.host == "capture" {
   guard let value = URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name == "payload"})?.value, let data = Data(base64Encoded:value), data.count < 1_000_000, let capture = (try? JSONSerialization.jsonObject(with:data)) as? [String:Any],
         capture["text"] is String || capture["paths"] is [String] else { continue }
   if ready { js("window.marginCapture",capture) } else { pending = capture }
  }
  window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
 }
 func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
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
