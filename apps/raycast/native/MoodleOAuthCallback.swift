import AppKit
import Foundation

final class AppDelegate: NSObject, NSApplicationDelegate {
  private let statePath = "/tmp/.moodle-oauth-state"

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSAppleEventManager.shared().setEventHandler(
      self,
      andSelector: #selector(handleURLEvent(_:withReplyEvent:)),
      forEventClass: AEEventClass(kInternetEventClass),
      andEventID: AEEventID(kAEGetURL)
    )
  }

  @objc private func handleURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent replyEvent: NSAppleEventDescriptor) {
    guard let callbackURL = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject))?.stringValue else {
      NSApp.terminate(nil)
      return
    }

    let handoff = readHandoff()
    let state = handoff.state

    guard !state.isEmpty else {
      NSApp.terminate(nil)
      return
    }

    guard let code = Data(callbackURL.utf8).base64URLEncodedString() else {
      NSApp.terminate(nil)
      return
    }

    var components = URLComponents()
    components.scheme = "raycast"
    components.host = "oauth"
    components.queryItems = [
      URLQueryItem(name: "package_name", value: handoff.packageName),
      URLQueryItem(name: "state", value: state),
      URLQueryItem(name: "code", value: code),
    ]

    if let url = components.url {
      NSWorkspace.shared.open(url)
    }

    NSApp.terminate(nil)
  }

  private func readHandoff() -> (state: String, packageName: String) {
    let raw = (try? String(contentsOfFile: statePath, encoding: .utf8))
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""

    guard let data = raw.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: String]
    else {
      return (raw, "Extension")
    }

    return (
      json["state"] ?? "",
      json["packageName"] ?? "Extension"
    )
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

private extension Data {
  func base64URLEncodedString() -> String? {
    self.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
