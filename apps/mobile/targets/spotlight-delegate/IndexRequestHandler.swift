import CoreSpotlight
import UniformTypeIdentifiers

class IndexRequestHandler: CSIndexExtensionRequestHandler {
    private let appGroup = "group.moodle.mobile"
    private let coursesKey = "spotlight-current-courses"
    private let domainIdentifier = "courses"

    override func searchableIndex(_ searchableIndex: CSSearchableIndex, reindexAllSearchableItemsWithAcknowledgementHandler acknowledgementHandler: @escaping () -> Void) {
        let items = loadItems()

        searchableIndex.deleteSearchableItems(withDomainIdentifiers: [domainIdentifier]) { _ in
            guard !items.isEmpty else {
                acknowledgementHandler()
                return
            }

            searchableIndex.indexSearchableItems(items) { _ in
                acknowledgementHandler()
            }
        }
    }

    override func searchableIndex(_ searchableIndex: CSSearchableIndex, reindexSearchableItemsWithIdentifiers identifiers: [String], acknowledgementHandler: @escaping () -> Void) {
        let items = loadItems().filter { identifiers.contains($0.uniqueIdentifier) }
        let indexedIdentifiers = Set(items.map(\.uniqueIdentifier))
        let staleIdentifiers = identifiers.filter { !indexedIdentifiers.contains($0) }

        let finishIndexing = {
            guard !items.isEmpty else {
                acknowledgementHandler()
                return
            }

            searchableIndex.indexSearchableItems(items) { _ in
                acknowledgementHandler()
            }
        }

        guard !staleIdentifiers.isEmpty else {
            finishIndexing()
            return
        }

        searchableIndex.deleteSearchableItems(withIdentifiers: staleIdentifiers) { _ in
            finishIndexing()
        }
    }

    private func loadItems() -> [CSSearchableItem] {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let records = defaults.array(forKey: coursesKey) as? [[String: Any]]
        else {
            return []
        }

        return records.compactMap { record in
            guard
                let id = record["id"] as? String,
                let title = record["title"] as? String
            else {
                return nil
            }

            let attributes = CSSearchableItemAttributeSet(contentType: UTType.item)
            attributes.title = title
            attributes.displayName = title
            attributes.contentDescription = record["subtitle"] as? String
            attributes.identifier = id

            if let keywords = record["keywords"] as? String, !keywords.isEmpty {
                attributes.keywords = keywords
                    .split(separator: "\n")
                    .map(String.init)
                    .filter { !$0.isEmpty }
            } else if let keywords = record["keywords"] as? [String], !keywords.isEmpty {
                attributes.keywords = keywords
            } else if let subtitle = record["subtitle"] as? String, !subtitle.isEmpty {
                attributes.keywords = [subtitle]
            }

            if let deeplink = record["deeplink"] as? String, let url = URL(string: deeplink) {
                attributes.contentURL = url
            }

            if let updatedAt = record["updatedAt"] as? Double, updatedAt > 0 {
                attributes.contentModificationDate = Date(timeIntervalSince1970: updatedAt / 1000)
            } else if let updatedAt = record["updatedAt"] as? Int, updatedAt > 0 {
                attributes.contentModificationDate = Date(timeIntervalSince1970: TimeInterval(updatedAt) / 1000)
            }

            if let lastUsedAt = record["lastUsedAt"] as? Double, lastUsedAt > 0 {
                attributes.lastUsedDate = Date(timeIntervalSince1970: lastUsedAt / 1000)
            } else if let lastUsedAt = record["lastUsedAt"] as? Int, lastUsedAt > 0 {
                attributes.lastUsedDate = Date(timeIntervalSince1970: TimeInterval(lastUsedAt) / 1000)
            }

            return CSSearchableItem(
                uniqueIdentifier: id,
                domainIdentifier: domainIdentifier,
                attributeSet: attributes
            )
        }
    }
}
