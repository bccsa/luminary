import InAppSpy from "inapp-spy";

declare global {
    interface Window {
        // Telegram's JS bridge, exposed in both its in-app browser and its Mini App webviews.
        TelegramWebviewProxy?: unknown;
        // Set by the extension script Telegram injects into in-app browser tabs on Android.
        __tg__webview_set?: boolean;
    }
}

/**
 * Whether this bundle is the packaged native app's build target.
 *
 * The packaged app's webview trips inapp-spy's generic markers, but it is the
 * app itself — there is no external browser to send the user to — so the
 * in-app interstitial must not fire there. Decided at build time: the packaged
 * app ships its own build flavour rather than the browser bundle.
 */
export function isNativeApp(): boolean {
    return import.meta.env.VITE_BUILD_TARGET === "native";
}

/**
 * Whether the page is running inside Telegram's in-app browser.
 *
 * Kept alongside inapp-spy because it checks a different set of signals: inapp-spy has no
 * Telegram user agent pattern and doesn't look at the Android extension marker.
 */
export function isTelegramBrowser(userAgent?: string): boolean {
    const ua = (
        userAgent ??
        (typeof navigator !== "undefined" ? navigator.userAgent : "") ??
        ""
    ).toLowerCase();
    if (ua.includes("telegram")) return true;

    if (typeof window === "undefined") return false;
    return window.TelegramWebviewProxy !== undefined || window.__tg__webview_set === true;
}

/**
 * Whether the page is running inside an app's in-app browser rather than a real browser.
 *
 * inapp-spy names the common social apps and falls back to generic webview markers. It can't
 * see iOS SFSafariViewController, which reports a user agent identical to Safari's, so apps
 * using it read as ordinary browsers unless they expose a bridge the way Telegram does.
 */
export function isInAppBrowser(userAgent?: string): boolean {
    // The packaged app's own webview is not an in-app browser. Only trust this for
    // the live runtime, never during SSG prerender or UA-only tests.
    if (!userAgent && isNativeApp()) return false;

    if (isTelegramBrowser(userAgent)) return true;

    // inapp-spy reads navigator when given no user agent, so skip it during SSG prerender.
    if (!userAgent && typeof window === "undefined") return false;
    return InAppSpy({ ua: userAgent }).isInApp;
}
