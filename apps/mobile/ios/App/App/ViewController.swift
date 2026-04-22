import UIKit
import Capacitor
import WebKit
import ObjectiveC.runtime

class ViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        hideKeyboardInputAccessoryView()
        enableInteractiveKeyboardDismiss()
    }

    // Because we hide iOS's input accessory bar (which contains the Done
    // button), the user would otherwise have no native way to dismiss the
    // keyboard. Enable interactive swipe-down dismissal on the web view's
    // scroll view — this is the same gesture Messages, Mail, and most
    // first-party iOS apps use. Dragging the content area downward follows
    // the finger and hides the keyboard when it reaches the bottom.
    private func enableInteractiveKeyboardDismiss() {
        guard let webView = self.webView else { return }
        webView.scrollView.keyboardDismissMode = .interactive
    }

    // The iOS keyboard shows a native "input accessory view" above the
    // software keyboard — the row with Prev/Next arrows and the Done button.
    // Capacitor's `Keyboard.resize: native` resizes the web view above the
    // keyboard itself, but the accessory view sits on top of that and
    // overlaps the editor toolbar. We hide it by dynamically subclassing
    // WebKit's internal WKContentView and overriding `inputAccessoryView`
    // to return nil. This is the canonical way to remove it in WKWebView
    // apps and doesn't depend on the @capacitor/keyboard JS bridge being
    // reachable at call time.
    private func hideKeyboardInputAccessoryView() {
        guard let webView = self.webView else { return }
        guard let contentView = webView.scrollView.subviews.first(where: {
            String(describing: type(of: $0)).contains("WKContent")
        }) else { return }

        let originalClass: AnyClass = type(of: contentView)
        let subclassName = "TriliumNoAccessoryView_\(NSStringFromClass(originalClass))"

        // If we've already generated the subclass on a previous run, reuse it.
        if let existing = NSClassFromString(subclassName) {
            object_setClass(contentView, existing)
            return
        }

        guard let subclass = objc_allocateClassPair(originalClass, subclassName, 0) else {
            return
        }

        let selector = NSSelectorFromString("inputAccessoryView")
        if let method = class_getInstanceMethod(UIView.self, selector) {
            let block: @convention(block) (AnyObject) -> UIView? = { _ in nil }
            let implementation = imp_implementationWithBlock(block)
            class_addMethod(subclass, selector, implementation, method_getTypeEncoding(method))
        }

        objc_registerClassPair(subclass)
        object_setClass(contentView, subclass)
    }
}
