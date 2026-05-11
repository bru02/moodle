import ExpoModulesCore
import CoreSpotlight
import Foundation
import UIKit

private class InvalidURLException: GenericException<Void>, @unchecked Sendable {
  override var reason: String { "Expected a valid URL string." }
}

private class InvalidSchemeException: GenericException<Void>, @unchecked Sendable {
  override var reason: String { "universalLinksOnly requires an http or https URL." }
}

private class InvalidPayloadException: GenericException<Void>, @unchecked Sendable {
  override var reason: String { "Expected non-empty activityType and title." }
}

private struct UserInfoPayload: @unchecked Sendable {
  let value: [AnyHashable: Any]
}

public class UniversalLinksModule: Module {
  private static var currentActivity: NSUserActivity?

  public func definition() -> ModuleDefinition {
    Name("UniversalLinksModule")

    AsyncFunction("openUniversalLinkOnly") { (urlString: String) -> Bool in
      guard let url = URL(string: urlString) else {
        throw InvalidURLException(())
      }

      let scheme = url.scheme?.lowercased()
      guard scheme == "http" || scheme == "https" else {
        throw InvalidSchemeException(())
      }

      return await withCheckedContinuation { continuation in
        Task { @MainActor in
          UIApplication.shared.open(
            url,
            options: [.universalLinksOnly: true]
          ) { success in
            continuation.resume(returning: success)
          }
        }
      }
    }

    AsyncFunction("donateUserActivity") { (payload: [String: Any]) in
      guard
        let activityType = payload["activityType"] as? String,
        !activityType.isEmpty,
        let title = payload["title"] as? String,
        !title.isEmpty
      else {
        throw InvalidPayloadException(())
      }

      let eligibleForSearch = payload["eligibleForSearch"] as? Bool ?? true
      let eligibleForPrediction = payload["eligibleForPrediction"] as? Bool ?? true
      let isPubliclyIndexable = payload["isPubliclyIndexable"] as? Bool ?? false
      let keywords = payload["keywords"] as? [String] ?? []
      let description = payload["description"] as? String
      let urlString = payload["url"] as? String
      let persistentIdentifier = payload["persistentIdentifier"] as? String

      var userInfo = payload["userInfo"] as? [AnyHashable: Any] ?? [:]
      if let route = payload["route"] as? String, !route.isEmpty {
        userInfo["route"] = route
      }
      if let urlString, !urlString.isEmpty {
        userInfo["url"] = urlString
      }
      let userInfoPayload = UserInfoPayload(value: userInfo)

      await MainActor.run {
        let activity = NSUserActivity(activityType: activityType)
        activity.title = title
        activity.userInfo = userInfoPayload.value
        activity.isEligibleForSearch = eligibleForSearch
        activity.isEligibleForPrediction = eligibleForPrediction
        activity.isEligibleForPublicIndexing = isPubliclyIndexable

        if let persistentIdentifier, !persistentIdentifier.isEmpty {
          activity.persistentIdentifier = NSUserActivityPersistentIdentifier(persistentIdentifier)
        }

        if !keywords.isEmpty {
          activity.keywords = Set(keywords.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
        }

        let attributes = CSSearchableItemAttributeSet(itemContentType: "public.item")
        attributes.title = title
        if let description, !description.isEmpty {
          attributes.contentDescription = description
        }
        if let urlString, let url = URL(string: urlString) {
          attributes.url = url
        }
        activity.contentAttributeSet = attributes

        Self.currentActivity?.invalidate()
        Self.currentActivity = activity
        activity.becomeCurrent()
      }
    }

    AsyncFunction("clearCurrentUserActivity") {
      await MainActor.run {
        Self.currentActivity?.invalidate()
        Self.currentActivity = nil
      }
    }
  }
}
