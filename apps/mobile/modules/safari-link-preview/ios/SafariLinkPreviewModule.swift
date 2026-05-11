import ExpoModulesCore
import Darwin
import Foundation
import ObjectiveC.runtime
import UIKit

private class InvalidURLException: GenericException<Void>, @unchecked Sendable {
  override var reason: String { "Expected a valid URL string." }
}

private class InvalidSchemeException: GenericException<Void>, @unchecked Sendable {
  override var reason: String { "Safari link previews require an http or https URL." }
}

public class SafariLinkPreviewModule: Module {
  private static var dataDetectorsHandle: UnsafeMutableRawPointer?
  private static var contextMenuDelegateAssociationKey: UInt8 = 0

  public func definition() -> ModuleDefinition {
    Name("SafariLinkPreviewModule")

    AsyncFunction("present") { (urlString: String, sourceRectPayload: [String: Any]?) in
      guard let url = URL(string: urlString) else {
        throw InvalidURLException(())
      }

      let scheme = url.scheme?.lowercased()
      guard scheme == "http" || scheme == "https" else {
        throw InvalidSchemeException(())
      }

      try await MainActor.run {
        guard let presenter = Self.topViewController() else {
          throw NSError(domain: "SafariLinkPreviewModule", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not find a view controller to present from."])
        }

        guard presenter.presentedViewController == nil else {
          throw NSError(domain: "SafariLinkPreviewModule", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot show link preview because another modal is already presented."])
        }

        let nsPayload = sourceRectPayload.map { $0 as NSDictionary }
        let dataDetectorsPreview = try Self.makeDataDetectorsContextMenuConfiguration(
          url: url,
          in: presenter.view,
          sourceRectPayload: nsPayload
        )
        let sourceLineRects = Self.resolvedSourceLineRects(from: nsPayload)
        let previewRect = Self.resolvedPreviewRect(
          from: nsPayload,
          fallback: dataDetectorsPreview.sourceRect,
          in: presenter.view
        )

        try Self.presentContextMenu(
          configuration: dataDetectorsPreview.configuration,
          url: url,
          in: presenter.view,
          sourceRect: dataDetectorsPreview.sourceRect,
          previewRect: previewRect,
          sourceLineRects: sourceLineRects,
          retainedObjects: []
        )
      }
    }
  }

  private static func makeDataDetectorsContextMenuConfiguration(
    url: URL,
    in view: UIView,
    sourceRectPayload: NSDictionary?
  ) throws -> (configuration: UIContextMenuConfiguration, sourceRect: CGRect) {
    let loaded = ensureDataDetectorsFrameworkLoaded()

    guard let contextMenuActionClass = NSClassFromString("DDContextMenuAction") else {
      throw previewError(
        "DDContextMenuAction class not found.",
        details: [
          "Tried loading DataDetectorsUI.framework: \(loaded ? "success" : "failed")",
          "Class lookup: NSClassFromString(\"DDContextMenuAction\")",
          "If this is Simulator, the private class may be absent on that runtime.",
          "If this is Device, API may be gated by OS variant or changed in this build."
        ]
      )
    }

    let sourceRect = resolvedSourceRect(from: sourceRectPayload, in: view)
    let (previewContext, usedSourceRectAPI, sourceRectAPIName) = dataDetectorsPreviewContext(
      for: sourceRect,
      contextMenuActionClass: contextMenuActionClass
    )

    guard usedSourceRectAPI else {
      throw previewError(
        "Unable to apply required DataDetectors source rect to preview context.",
        details: [
          "DataDetectors requires +[DDContextMenuConfiguration updateContext:withSourceRect:]",
          "Expected selector: updateContext:withSourceRect:",
          "Tried classes: DDContextMenuAction, DDContextMenuConfiguration",
          "Computed sourceRect: \(NSCoder.string(for: sourceRect))"
        ]
      )
    }

    var attemptedSelectors: [String] = []

    let selectorA = NSSelectorFromString("contextMenuConfigurationWithURL:inView:context:menuIdentifier:")
    if let method = class_getClassMethod(contextMenuActionClass, selectorA) {
      attemptedSelectors.append(NSStringFromSelector(selectorA))
      typealias FactoryA = @convention(c) (AnyClass, Selector, NSURL, UIView, NSDictionary?, NSString?) -> UIContextMenuConfiguration?
      let function = unsafeBitCast(method_getImplementation(method), to: FactoryA.self)
      if let config = function(contextMenuActionClass, selectorA, url as NSURL, view, previewContext, nil) {
        return (config, sourceRect)
      }
    }

    let selectorB = NSSelectorFromString("contextMenuConfigurationForURL:identifier:selectedText:results:inView:context:menuIdentifier:")
    if let method = class_getClassMethod(contextMenuActionClass, selectorB) {
      attemptedSelectors.append(NSStringFromSelector(selectorB))
      typealias FactoryB = @convention(c) (
        AnyClass,
        Selector,
        NSURL,
        NSString?,
        NSString?,
        NSArray?,
        UIView,
        NSDictionary?,
        NSString?
      ) -> UIContextMenuConfiguration?
      let function = unsafeBitCast(method_getImplementation(method), to: FactoryB.self)
      if let config = function(contextMenuActionClass, selectorB, url as NSURL, nil, nil, nil, view, previewContext, nil) {
        return (config, sourceRect)
      }
    }

    if attemptedSelectors.isEmpty {
      throw previewError(
        "DDContextMenuAction exists but expected class methods were not found.",
        details: [
          "Tried selectors:",
          "- contextMenuConfigurationWithURL:inView:context:menuIdentifier:",
          "- contextMenuConfigurationForURL:identifier:selectedText:results:inView:context:menuIdentifier:",
          "Private API shape likely changed on this iOS version."
        ]
      )
    }

    throw previewError(
      "DataDetectors returned no context menu configuration for URL.",
      details: [
        "URL: \(url.absoluteString)",
        "Attempted selectors: \(attemptedSelectors.joined(separator: ", "))",
        "Context includes DD wants-preview key and source rect.",
        "Source rect API used: \(sourceRectAPIName)"
      ]
    )
  }

  private static func presentContextMenu(
    configuration: UIContextMenuConfiguration,
    url: URL,
    in containerView: UIView,
    sourceRect: CGRect,
    previewRect: CGRect,
    sourceLineRects: [CGRect] = [],
    retainedObjects: [AnyObject] = []
  ) throws {
    let rect = sourceRect.width > 0 && sourceRect.height > 0
      ? sourceRect
      : CGRect(x: sourceRect.minX, y: sourceRect.minY, width: 1, height: 1)

    let anchor = UIView(frame: rect)
    anchor.backgroundColor = .clear
    anchor.isUserInteractionEnabled = true
    containerView.addSubview(anchor)

    let filteredConfiguration = filteredConfigurationForApp(from: configuration)

    let delegate = DataDetectorsContextMenuDelegate(
      configuration: filteredConfiguration,
      url: url,
      previewContainerView: containerView,
      sourceRect: rect,
      previewRect: previewRect,
      sourceLineRects: sourceLineRects,
      retainedObjects: retainedObjects
    ) {
      anchor.removeFromSuperview()
    }

    let interaction = UIContextMenuInteraction(delegate: delegate)
    anchor.addInteraction(interaction)
    objc_setAssociatedObject(anchor, &contextMenuDelegateAssociationKey, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)

    let location = CGPoint(x: rect.midX, y: rect.midY)
    let locationInAnchor = anchor.convert(location, from: containerView)

    let selectorNames = ["_presentMenuAtLocation:", "_presentMenuAtPoint:"]
    for selectorName in selectorNames {
      let selector = NSSelectorFromString(selectorName)
      if let method = class_getInstanceMethod(UIContextMenuInteraction.self, selector) {
        typealias PresentMenu = @convention(c) (AnyObject, Selector, CGPoint) -> Void
        let function = unsafeBitCast(method_getImplementation(method), to: PresentMenu.self)
        function(interaction, selector, locationInAnchor)
        return
      }
    }

    anchor.removeFromSuperview()
    throw previewError(
      "Unable to programmatically present private context menu interaction.",
      details: [
        "Expected private selectors not found on UIContextMenuInteraction.",
        "Tried: _presentMenuAtLocation:, _presentMenuAtPoint:"
      ]
    )
  }

  private static func ensureDataDetectorsFrameworkLoaded() -> Bool {
    if NSClassFromString("DDContextMenuAction") != nil {
      return true
    }

    let candidates = [
      "/System/Library/PrivateFrameworks/DataDetectorsUI.framework/DataDetectorsUI",
      "/System/Library/PrivateFrameworks/DataDetectorsUI.framework/DataDetectorsUI.tbd"
    ]

    for path in candidates {
      if dataDetectorsHandle == nil {
        dataDetectorsHandle = dlopen(path, RTLD_LAZY | RTLD_GLOBAL)
      }
      if dataDetectorsHandle != nil {
        return NSClassFromString("DDContextMenuAction") != nil
      }
    }

    return false
  }

  private static func dataDetectorsPreviewContext(
    for sourceRect: CGRect,
    contextMenuActionClass: AnyClass
  ) -> (context: NSDictionary, usedSourceRectAPI: Bool, sourceRectAPIName: String) {
    let baseContext = dataDetectorsPreviewContextBase()

    if let updated = updateContext(baseContext, with: sourceRect, on: contextMenuActionClass) {
      return (updated, true, "DDContextMenuAction.updateContext:withSourceRect:")
    }

    if let contextMenuConfigurationClass = NSClassFromString("DDContextMenuConfiguration"),
       let updated = updateContext(baseContext, with: sourceRect, on: contextMenuConfigurationClass) {
      return (updated, true, "DDContextMenuConfiguration.updateContext:withSourceRect:")
    }

    return (baseContext, false, "none")
  }

  private static func dataDetectorsPreviewContextBase() -> NSDictionary {
    let wantsPreviewValue: Any = true

    if let key = dataDetectorsStringConstant(named: "kDDContextMenuWantsPreviewKey") {
      return [key: wantsPreviewValue] as NSDictionary
    }

    return ["kDDContextMenuWantsPreviewKey": wantsPreviewValue] as NSDictionary
  }

  private static func updateContext(_ context: NSDictionary, with sourceRect: CGRect, on cls: AnyClass) -> NSDictionary? {
    let selector = NSSelectorFromString("updateContext:withSourceRect:")
    guard let method = class_getClassMethod(cls, selector) else {
      return nil
    }

    typealias UpdateContext = @convention(c) (AnyClass, Selector, NSDictionary, CGRect) -> NSDictionary?
    let function = unsafeBitCast(method_getImplementation(method), to: UpdateContext.self)
    return function(cls, selector, context, sourceRect)
  }

  private static func dataDetectorsStringConstant(named symbol: String) -> NSString? {
    guard ensureDataDetectorsFrameworkLoaded(), let handle = dataDetectorsHandle else {
      return nil
    }

    guard let rawSymbol = dlsym(handle, symbol) else {
      return nil
    }

    let pointer = rawSymbol.assumingMemoryBound(to: AnyObject?.self)
    return pointer.pointee as? NSString
  }

  private static func resolvedSourceRect(from payload: NSDictionary?, in view: UIView) -> CGRect {
    let fallback = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)

    guard
      let payload,
      let x = payload["x"] as? NSNumber,
      let y = payload["y"] as? NSNumber
    else {
      return fallback
    }

    let width = max((payload["width"] as? NSNumber)?.doubleValue ?? 1, 1)
    let height = max((payload["height"] as? NSNumber)?.doubleValue ?? 1, 1)
    let windowRect = CGRect(x: x.doubleValue, y: y.doubleValue, width: width, height: height)

    return view.convert(windowRect, from: nil)
  }

  private static func resolvedSourceLineRects(from payload: NSDictionary?) -> [CGRect] {
    guard let payload, let lineRectPayloads = payload["lineRects"] as? [Any] else {
      return []
    }

    return lineRectPayloads.compactMap { lineRectPayload in
      guard let lineRectPayload = lineRectPayload as? NSDictionary else {
        return nil
      }

      guard
        let x = lineRectPayload["x"] as? NSNumber,
        let y = lineRectPayload["y"] as? NSNumber,
        let width = lineRectPayload["width"] as? NSNumber,
        let height = lineRectPayload["height"] as? NSNumber
      else {
        return nil
      }

      let rect = CGRect(
        x: x.doubleValue,
        y: y.doubleValue,
        width: width.doubleValue,
        height: height.doubleValue
      )

      return rect.width > 0 && rect.height > 0 ? rect : nil
    }
  }

  private static func resolvedPreviewRect(from payload: NSDictionary?, fallback: CGRect, in view: UIView) -> CGRect {
    guard let payload, let previewRectPayload = payload["previewRect"] as? NSDictionary else {
      return fallback
    }

    return resolvedPayloadRect(from: previewRectPayload, fallback: fallback, in: view)
  }

  private static func resolvedPayloadRect(from payload: NSDictionary, fallback: CGRect, in view: UIView) -> CGRect {
    guard
      let x = payload["x"] as? NSNumber,
      let y = payload["y"] as? NSNumber
    else {
      return fallback
    }

    let width = max((payload["width"] as? NSNumber)?.doubleValue ?? fallback.width, 1)
    let height = max((payload["height"] as? NSNumber)?.doubleValue ?? fallback.height, 1)
    let windowRect = CGRect(x: x.doubleValue, y: y.doubleValue, width: width, height: height)
    return view.convert(windowRect, from: nil)
  }

  private static func filteredConfigurationForApp(from configuration: UIContextMenuConfiguration) -> UIContextMenuConfiguration {
    let previewSelector = NSSelectorFromString("previewProvider")
    let actionSelector = NSSelectorFromString("actionProvider")

    let previewProviderObject = configuration.responds(to: previewSelector)
      ? configuration.perform(previewSelector)?.takeUnretainedValue()
      : nil
    let actionProviderObject = configuration.responds(to: actionSelector)
      ? configuration.perform(actionSelector)?.takeUnretainedValue()
      : nil

    typealias PreviewProvider = @convention(block) () -> UIViewController?
    typealias ActionProvider = @convention(block) ([UIMenuElement]) -> UIMenu?

    let previewProvider = previewProviderObject.map { object in
      unsafeBitCast(object, to: PreviewProvider.self)
    }

    let originalActionProvider = actionProviderObject.map { object in
      unsafeBitCast(object, to: ActionProvider.self)
    }

    return UIContextMenuConfiguration(
      identifier: nil,
      previewProvider: previewProvider,
      actionProvider: { suggestedActions in
        originalActionProvider?(suggestedActions)
          ?? UIMenu(title: "", children: suggestedActions)
      }
    )
  }

  private static func previewError(_ summary: String, details: [String]) -> NSError {
    NSError(
      domain: "SafariLinkPreviewModule",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: ([summary] + details).joined(separator: "\n")]
    )
  }

  fileprivate static func topViewController(
    from root: UIViewController? = UIApplication.shared
      .connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)?
      .rootViewController
  ) -> UIViewController? {
    if let navigationController = root as? UINavigationController {
      return topViewController(from: navigationController.visibleViewController)
    }

    if let tabBarController = root as? UITabBarController {
      return topViewController(from: tabBarController.selectedViewController)
    }

    if let presentedViewController = root?.presentedViewController {
      return topViewController(from: presentedViewController)
    }

    return root
  }
}

private final class DataDetectorsContextMenuDelegate: NSObject, UIContextMenuInteractionDelegate {
  private let configuration: UIContextMenuConfiguration
  private let url: URL
  private weak var previewContainerView: UIView?
  private let sourceRect: CGRect
  private let previewRect: CGRect
  private let sourceLineRects: [CGRect]
  private let retainedObjects: [AnyObject]
  private let onEnd: () -> Void
  private var contextMenuInteractionTargetedPreview: UITargetedPreview?

  init(
    configuration: UIContextMenuConfiguration,
    url: URL,
    previewContainerView: UIView,
    sourceRect: CGRect,
    previewRect: CGRect,
    sourceLineRects: [CGRect],
    retainedObjects: [AnyObject],
    onEnd: @escaping () -> Void
  ) {
    self.configuration = configuration
    self.url = url
    self.previewContainerView = previewContainerView
    self.sourceRect = sourceRect
    self.previewRect = previewRect
    self.sourceLineRects = sourceLineRects
    self.retainedObjects = retainedObjects
    self.onEnd = onEnd
    super.init()
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    configuration
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    createTargetedPreviewIfPossible()
  }

  @objc(contextMenuInteraction:configuration:highlightPreviewForItemWithIdentifier:)
  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    highlightPreviewForItemWithIdentifier identifier: NSCopying
  ) -> UITargetedPreview? {
    createTargetedPreviewIfPossible()
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    let preview = contextMenuInteractionTargetedPreview
    contextMenuInteractionTargetedPreview = nil
    return preview
  }

  @objc(contextMenuInteraction:configuration:dismissalPreviewForItemWithIdentifier:)
  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    dismissalPreviewForItemWithIdentifier identifier: NSCopying
  ) -> UITargetedPreview? {
    let preview = contextMenuInteractionTargetedPreview
    contextMenuInteractionTargetedPreview = nil
    return preview
  }

  private func createTargetedPreviewIfPossible() -> UITargetedPreview? {
    if let contextMenuInteractionTargetedPreview {
      return contextMenuInteractionTargetedPreview
    }

    guard let previewContainerView else {
      return nil
    }

    let rect = previewRect.width > 0 && previewRect.height > 0
      ? previewRect
      : CGRect(x: sourceRect.minX, y: sourceRect.minY, width: 1, height: 1)

    guard previewContainerView.window != nil else {
      return nil
    }

    guard let snapshotView = snapshotLinkRegion(in: previewContainerView, rect: rect) else {
      return fallbackTargetedPreview(in: previewContainerView, rect: rect)
    }

    let parameters = UIPreviewParameters(textLineRects: previewTextLineRects(
      previewBounds: snapshotView.bounds,
      originalRect: sourceRect,
      sourceRect: snapshotView.frame
    ))
    parameters.backgroundColor = .clear

    let target = UIPreviewTarget(
      container: previewContainerView,
      center: CGPoint(x: rect.midX, y: rect.midY)
    )

    let preview = UITargetedPreview(view: snapshotView, parameters: parameters, target: target)
    contextMenuInteractionTargetedPreview = preview
    return preview
  }

  private func snapshotLinkRegion(in containerView: UIView, rect: CGRect) -> UIView? {
    let sourceRect = rect.intersection(containerView.bounds)
    guard sourceRect.width > 0 && sourceRect.height > 0 else {
      return nil
    }

    let rendererFormat = UIGraphicsImageRendererFormat()
    rendererFormat.scale = containerView.window?.screen.scale ?? UIScreen.main.scale
    rendererFormat.opaque = false

    let renderer = UIGraphicsImageRenderer(size: sourceRect.size, format: rendererFormat)
    let image = renderer.image { ctx in
      ctx.cgContext.translateBy(x: -sourceRect.origin.x, y: -sourceRect.origin.y)
      containerView.drawHierarchy(in: containerView.bounds, afterScreenUpdates: false)
    }

    let imageView = UIImageView(image: image)
    imageView.frame = sourceRect
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    return imageView
  }

  private func previewTextLineRects(
    previewBounds: CGRect,
    originalRect: CGRect,
    sourceRect: CGRect
  ) -> [NSValue] {
    let lineRects = sourceLineRects.isEmpty
      ? [CGRect(origin: .zero, size: originalRect.size)]
      : sourceLineRects

    let clippedLineRects = lineRects.compactMap { lineRect -> NSValue? in
      let rectInContainer = lineRect.offsetBy(dx: originalRect.minX, dy: originalRect.minY)
      let rectInPreview = rectInContainer
        .intersection(sourceRect)
        .offsetBy(dx: -sourceRect.minX, dy: -sourceRect.minY)
        .intersection(previewBounds)

      guard rectInPreview.width > 0 && rectInPreview.height > 0 else {
        return nil
      }

      return NSValue(cgRect: rectInPreview)
    }

    return clippedLineRects.isEmpty
      ? [NSValue(cgRect: previewBounds)]
      : clippedLineRects
  }

  private func fallbackTargetedPreview(in containerView: UIView, rect: CGRect) -> UITargetedPreview? {
    let sourceRect = rect.intersection(containerView.bounds)
    guard
      sourceRect.width > 0,
      sourceRect.height > 0,
      let snapshotView = containerView.resizableSnapshotView(
        from: sourceRect,
        afterScreenUpdates: false,
        withCapInsets: .zero
      )
    else {
      return nil
    }

    snapshotView.frame = sourceRect

    let parameters = UIPreviewParameters(textLineRects: previewTextLineRects(
      previewBounds: snapshotView.bounds,
      originalRect: rect,
      sourceRect: sourceRect
    ))
    parameters.backgroundColor = .clear

    let target = UIPreviewTarget(
      container: containerView,
      center: CGPoint(x: sourceRect.midX, y: sourceRect.midY)
    )

    let preview = UITargetedPreview(view: snapshotView, parameters: parameters, target: target)
    contextMenuInteractionTargetedPreview = preview
    return preview
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willPerformPreviewActionForMenuWith configuration: UIContextMenuConfiguration,
    animator: UIContextMenuInteractionCommitAnimating
  ) {
    animator.addCompletion { [url] in
      UIApplication.shared.open(url)
    }
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willEndFor configuration: UIContextMenuConfiguration,
    animator: UIContextMenuInteractionAnimating?
  ) {
    animator?.addCompletion {
      self.contextMenuInteractionTargetedPreview = nil
      self.onEnd()
    }

    if animator == nil {
      contextMenuInteractionTargetedPreview = nil
      onEnd()
    }
  }
}
