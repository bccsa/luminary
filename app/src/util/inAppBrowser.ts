declare global {
    interface Window {
        // Telegram's JS bridge, exposed in both its in-app browser and its Mini App webviews.
        TelegramWebviewProxy?: unknown;
        // Set by the extension script Telegram injects into in-app browser tabs on Android.
        __tg__webview_set?: boolean;
    }
}

/**
 * Whether the page is running inside Telegram's in-app browser.
 *
 * Telegram only tags the user agent for Mini App webviews, and its iOS browser reports a
 * user agent identical to Safari's, so the UA check alone misses ordinary link taps. The
 * injected bridge is the reliable signal: Telegram exposes it at document start on both
 * platforms, so it is already present when this runs.
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
