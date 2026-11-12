import Foundation
import AVFoundation
import Speech

// Voice messages for listening practice: bring in any audio the Mac can read (an iMessage voice message, a Voice Memo,
// an mp4 or m4a, mp3, wav…), keep it as AAC in Notival's own folder so the page can play it, and draft the words with
// the Mac's own speech recognition. Nothing here knows about the window; the app passes results along.
enum Listening {
 static func directory(next storage: URL) -> URL { storage.deletingLastPathComponent().appendingPathComponent("Listening", isDirectory: true) }

 struct Clip { let id: String; let name: String; let duration: Double }

 // Copies (or converts) `source` to <directory>/<id>.m4a. Calls back on a background queue.
 static func importClip(_ source: URL, into directory: URL, completion: @escaping (Result<Clip, Error>) -> Void) {
  DispatchQueue.global(qos: .userInitiated).async {
   do {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let id = UUID().uuidString, target = directory.appendingPathComponent(id + ".m4a")
    let asset = AVURLAsset(url: source)
    guard asset.tracks(withMediaType: .audio).count > 0 else { throw NSError(domain: "Listening", code: 1, userInfo: [NSLocalizedDescriptionKey: "That file has no audio Notival can read."]) }
    let seconds = CMTimeGetSeconds(asset.duration)
    guard seconds.isFinite, seconds > 0 else { throw NSError(domain: "Listening", code: 2, userInfo: [NSLocalizedDescriptionKey: "That audio is empty."]) }
    guard seconds <= 600 else { throw NSError(domain: "Listening", code: 3, userInfo: [NSLocalizedDescriptionKey: "Voice messages up to 10 minutes are supported."]) }
    guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else { throw NSError(domain: "Listening", code: 4, userInfo: [NSLocalizedDescriptionKey: "This audio format can't be converted."]) }
    export.outputURL = target; export.outputFileType = .m4a
    let done = DispatchSemaphore(value: 0)
    export.exportAsynchronously { done.signal() }
    done.wait()
    guard export.status == .completed else { throw export.error ?? NSError(domain: "Listening", code: 5, userInfo: [NSLocalizedDescriptionKey: "The audio could not be converted."]) }
    completion(.success(Clip(id: id, name: source.deletingPathExtension().lastPathComponent, duration: seconds)))
   } catch { completion(.failure(error)) }
  }
 }

 static func file(_ id: String, in directory: URL) -> URL? {
  // Ids are made by importClip; refuse anything that could point elsewhere.
  guard id.range(of: "^[A-Za-z0-9-]{8,64}$", options: .regularExpression) != nil else { return nil }
  let url = directory.appendingPathComponent(id + ".m4a")
  return FileManager.default.fileExists(atPath: url.path) ? url : nil
 }

struct Draft { let text: String; let words: [[String: Any]]; let onDevice: Bool }

 // A draft of what was said. By default the Mac does it on its own, and nothing leaves it. If this Mac hasn't got that
 // language's offline model, it says so (code 11) instead of quietly sending a personal message to Apple; the caller can
 // ask again with `allowServer` once the person agrees.
 static func transcribe(_ url: URL, locale: String = "ru-RU", allowServer: Bool = false, completion: @escaping (Result<Draft, Error>) -> Void) {
  func fail(_ message: String, code: Int = 10) { completion(.failure(NSError(domain: "Listening", code: code, userInfo: [NSLocalizedDescriptionKey: message]))) }
  SFSpeechRecognizer.requestAuthorization { status in
   switch status {
   case .authorized: break
   case .denied: return fail("Speech recognition is turned off for Notival. Allow it in System Settings → Privacy & Security → Speech Recognition.")
   case .restricted: return fail("Speech recognition is restricted on this Mac.")
   default: return fail("Notival needs permission for speech recognition to draft the words.")
   }
   guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.isAvailable else { return fail("Speech recognition isn't available for this language right now.") }
   let offline = recognizer.supportsOnDeviceRecognition
   if !offline && !allowServer { return fail("This Mac can't draft this language without sending the audio to Apple.", code: 11) }
   let request = SFSpeechURLRecognitionRequest(url: url)
   request.requiresOnDeviceRecognition = offline && !allowServer
   request.shouldReportPartialResults = true
   request.taskHint = .dictation
   if #available(macOS 13.0, *) { request.addsPunctuation = true }
   var finished = false, task: SFSpeechRecognitionTask?
   let lock = NSLock()
   func finish(_ outcome: Result<Draft, Error>) { lock.lock(); defer { lock.unlock() }; guard !finished else { return }; finished = true; watchdog?.cancel(); task?.cancel(); completion(outcome) }
   var watchdog: DispatchWorkItem?
   // The offline model is sometimes listed but not downloaded: then nothing ever comes back. Give it a while, then say so.
   func arm(_ seconds: Double) {
    watchdog?.cancel()
    let item = DispatchWorkItem { finish(.failure(NSError(domain: "Listening", code: offline ? 11 : 12, userInfo: [NSLocalizedDescriptionKey: offline ? "This Mac hasn't downloaded offline speech recognition for this language." : "Speech recognition didn't answer. Check your connection and try again."]))) }
    watchdog = item; DispatchQueue.global().asyncAfter(deadline: .now() + seconds, execute: item)
   }
   arm(20)
   task = recognizer.recognitionTask(with: request) { result, error in
    if let result {
     arm(20)
     if result.isFinal {
      let words = result.bestTranscription.segments.map { ["text": $0.substring, "start": $0.timestamp, "duration": $0.duration, "confidence": Double($0.confidence)] as [String: Any] }
      finish(.success(Draft(text: result.bestTranscription.formattedString, words: words, onDevice: offline)))
     }
    } else if let error {
     let text = (error as NSError).localizedDescription.lowercased()
     if text.contains("no speech") { finish(.success(Draft(text: "", words: [], onDevice: offline))) }
     else { finish(.failure(NSError(domain: "Listening", code: 10, userInfo: [NSLocalizedDescriptionKey: "The words couldn't be drafted: " + (error as NSError).localizedDescription]))) }
    }
   }
  }
 }
}
