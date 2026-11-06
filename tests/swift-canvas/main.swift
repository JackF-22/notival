import Foundation
// Exercises native/canvas.swift against a local mock Canvas calendar feed. The port arrives as the first argument.
let port = CommandLine.arguments[1]
let base = "http://127.0.0.1:\(port)"
let feed = base + "/feeds/calendars/user_secret123.ics"
CanvasKeychain.service = "Notival Canvas Test"
var failures: [String] = []
func check(_ ok: Bool, _ name: String) { if !ok { failures.append(name) } }

// Only a school's calendar feed link is reachable, over https (or plain http for a local test server).
check(CanvasClient.allowedFeed("https://school.instructure.com/feeds/calendars/user_abc.ics") != nil, "allows a feed link")
check(CanvasClient.allowedFeed("https://school.instructure.com/api/v1/users/self") == nil, "rejects the API")
check(CanvasClient.allowedFeed("https://school.instructure.com/feeds/calendars/user_abc") == nil, "rejects a non-ics path")
check(CanvasClient.allowedFeed("http://school.instructure.com/feeds/calendars/user_abc.ics") == nil, "rejects plain http for a real host")
check(CanvasClient.allowedFeed("https://user:pass@school.instructure.com/feeds/calendars/user_abc.ics") == nil, "rejects embedded credentials")
check(CanvasClient.allowedFeed("https://school.instructure.com/feeds/calendars/../login.ics") == nil, "rejects path traversal")
check(CanvasClient.origin(of: URL(string: "https://school.instructure.com/feeds/calendars/user_abc.ics")!) == "https://school.instructure.com", "finds the origin")

// Keychain round trip for the secret link.
CanvasKeychain.delete(base: base)
check(CanvasKeychain.get(base: base) == nil, "empty before saving")
check(CanvasKeychain.set(secret: feed, base: base), "saves")
check(CanvasKeychain.get(base: base) == feed, "reads back")

func fetch(_ run: (@escaping (CanvasResponse?, String?) -> Void) -> Void) -> (CanvasResponse?, String?) {
 var out: (CanvasResponse?, String?) = (nil, nil)
 let done = DispatchSemaphore(value: 0)
 run { response, error in out = (response, error); done.signal() }
 _ = done.wait(timeout: .now() + 15)
 return out
}
let pasted = fetch { CanvasClient.get(link: feed, completion: $0) }
check(pasted.0?.status == 200 && pasted.0?.body.contains("BEGIN:VCALENDAR") == true, "fetches a pasted link")
let saved = fetch { CanvasClient.getSaved(base: base, completion: $0) }
check(saved.0?.status == 200 && saved.0?.body.contains("SUMMARY:Lab 3") == true, "fetches the saved link")
let blocked = fetch { CanvasClient.get(link: base + "/api/v1/users/self", completion: $0) }
check(blocked.0 == nil && blocked.1 != nil, "a blocked link reports an error")
let gone = fetch { CanvasClient.get(link: base + "/feeds/calendars/user_missing.ics", completion: $0) }
check(gone.0?.status == 404, "passes a 404 through")
// A link saved for one school can't be used to reach another.
CanvasKeychain.set(secret: "https://other.instructure.com/feeds/calendars/user_z.ics", base: base)
let mismatch = fetch { CanvasClient.getSaved(base: base, completion: $0) }
check(mismatch.0 == nil && mismatch.1 != nil, "a saved link for another origin is refused")
CanvasKeychain.delete(base: base)
let missing = fetch { CanvasClient.getSaved(base: base, completion: $0) }
check(missing.0 == nil && (missing.1 ?? "").contains("Connect Canvas"), "no saved link reports an error")

print(failures.isEmpty ? "OK" : "FAILED: " + failures.joined(separator: "; "))
exit(failures.isEmpty ? 0 : 1)
