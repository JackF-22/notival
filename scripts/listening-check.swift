// Manual check of the listening code against real audio:
//   mkdir -p .build/check && cp scripts/listening-check.swift .build/check/main.swift
//   swiftc native/listening.swift .build/check/main.swift -o .build/listening-check -framework AVFoundation -framework Speech
//   .build/listening-check <audio files…>        (add --transcribe to also draft the words; --server lets Apple's servers do it)
import Foundation
let args = Array(CommandLine.arguments.dropFirst()), transcribe = args.contains("--transcribe")
let out = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("listening-check")
for path in args where !path.hasPrefix("--") {
 let sem = DispatchSemaphore(value: 0)
 Listening.importClip(URL(fileURLWithPath: path), into: out) { result in
  switch result {
  case .failure(let error): print("FAIL import \(path): \(error.localizedDescription)"); sem.signal()
  case .success(let clip):
   print("OK   import \(URL(fileURLWithPath: path).lastPathComponent) → \(clip.id).m4a, \(String(format: "%.1f", clip.duration))s")
   if transcribe, let file = Listening.file(clip.id, in: out) {
    Listening.transcribe(file, locale: args.first(where: { $0.hasPrefix("--locale=") }).map { String($0.dropFirst(9)) } ?? "ru-RU", allowServer: args.contains("--server")) { r in
     switch r { case .success(let d): print("OK   draft (\(d.onDevice ? "on this Mac" : "Apple servers")): \(d.text)"); case .failure(let e): print("FAIL draft: \(e.localizedDescription)") }
     sem.signal()
    }
   } else { sem.signal() }
  }
 }
 sem.wait()
}
