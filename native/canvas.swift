import Foundation
import Security

/// The Canvas calendar feed link is a secret (anyone holding it can read the calendar), so it lives in the macOS Keychain, never in the notes file, a backup, or the web page.
enum CanvasKeychain {
 static var service = "Notival Canvas"
 private static func query(_ base: String) -> [String: Any] {
  [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: base]
 }
 @discardableResult static func set(secret: String, base: String) -> Bool {
  delete(base: base)
  var item = query(base)
  item[kSecValueData as String] = Data(secret.utf8)
  item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
  return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
 }
 static func get(base: String) -> String? {
  var item = query(base)
  item[kSecReturnData as String] = true
  item[kSecMatchLimit as String] = kSecMatchLimitOne
  var result: AnyObject?
  guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
  return String(data: data, encoding: .utf8)
 }
 @discardableResult static func delete(base: String) -> Bool {
  let status = SecItemDelete(query(base) as CFDictionary)
  return status == errSecSuccess || status == errSecItemNotFound
 }
}

struct CanvasResponse { var status: Int; var body: String }

/// Read-only access to one Canvas calendar feed: a GET of a school's /feeds/calendars/….ics link, nothing else.
enum CanvasClient {
 static let maximumBytes = 5_000_000
 static func allowedFeed(_ string: String) -> URL? {
  guard let url = URL(string: string), let host = url.host, url.user == nil, url.password == nil else { return nil }
  let local = host == "localhost" || host == "127.0.0.1"
  guard url.scheme == "https" || (local && url.scheme == "http") else { return nil }
  guard url.path.hasPrefix("/feeds/calendars/"), url.path.hasSuffix(".ics"), !url.path.contains("..") else { return nil }
  return url
 }
 /// The origin ("https://school.instructure.com") a feed link belongs to.
 static func origin(of url: URL) -> String? {
  guard let scheme = url.scheme, let host = url.host else { return nil }
  return scheme + "://" + host + (url.port.map { ":\($0)" } ?? "")
 }
 static func fetch(feed: URL, completion: @escaping (CanvasResponse?, String?) -> Void) {
  var request = URLRequest(url: feed, timeoutInterval: 30)
  request.httpMethod = "GET"
  request.setValue("text/calendar, text/plain;q=0.8", forHTTPHeaderField: "Accept")
  let session = URLSession(configuration: .ephemeral)
  session.dataTask(with: request) { data, response, error in
   defer { session.finishTasksAndInvalidate() }
   if let error { completion(nil, error.localizedDescription); return }
   guard let http = response as? HTTPURLResponse else { completion(nil, "No response from Canvas."); return }
   guard (data?.count ?? 0) <= maximumBytes else { completion(nil, "That calendar is too large."); return }
   completion(CanvasResponse(status: http.statusCode, body: String(data: data ?? Data(), encoding: .utf8) ?? ""), nil)
  }.resume()
 }
 /// Fetch a link the user just pasted (to check it before saving).
 static func get(link: String, completion: @escaping (CanvasResponse?, String?) -> Void) {
  guard let url = allowedFeed(link) else { completion(nil, "That isn't a Canvas calendar link."); return }
  fetch(feed: url, completion: completion)
 }
 /// Fetch the link saved in the Keychain for a school.
 static func getSaved(base: String, completion: @escaping (CanvasResponse?, String?) -> Void) {
  guard let saved = CanvasKeychain.get(base: base) else { completion(nil, "No Canvas calendar link is saved. Connect Canvas again."); return }
  guard let url = allowedFeed(saved), origin(of: url) == base else { completion(nil, "The saved Canvas link isn't valid. Connect Canvas again."); return }
  fetch(feed: url, completion: completion)
 }
}
