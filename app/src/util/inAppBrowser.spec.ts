import { describe, it, expect, afterEach } from "vitest";
import { isInAppBrowser, isTelegramBrowser } from "./inAppBrowser";

// Real shapes produced by Telegram's webview code: it strips the "; wv" marker, rewrites the
// device to "K" and drops "Version/", leaving ordinary-looking Chrome/Safari user agents.
const TELEGRAM_ANDROID_BROWSER_UA =
    "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.135 Mobile Safari/537.36";
const TELEGRAM_ANDROID_MINIAPP_UA = `${TELEGRAM_ANDROID_BROWSER_UA} Telegram-Android/11.9.0 (Samsung SM-A155M; Android 14; SDK 34; AVERAGE)`;
const TELEGRAM_IOS_BROWSER_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/22F76 Safari/604.1";
const INSTAGRAM_IOS_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.5.32.98 (iPhone14,2; iOS 17_5; en_US)";
const GENERIC_ANDROID_WEBVIEW_UA =
    "Mozilla/5.0 (Linux; Android 14; SM-A155M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.135 Mobile Safari/537.36";

afterEach(() => {
    delete window.TelegramWebviewProxy;
    delete window.__tg__webview_set;
});

describe("isTelegramBrowser", () => {
    it("detects the Telegram-tagged Mini App user agent", () => {
        expect(isTelegramBrowser(TELEGRAM_ANDROID_MINIAPP_UA)).toBe(true);
    });

    it("detects the in-app browser via the injected bridge when the user agent is untagged", () => {
        window.TelegramWebviewProxy = { postEvent: () => {} };

        expect(isTelegramBrowser(TELEGRAM_ANDROID_BROWSER_UA)).toBe(true);
        expect(isTelegramBrowser(TELEGRAM_IOS_BROWSER_UA)).toBe(true);
    });

    it("detects the Android in-app browser via the injected extension marker", () => {
        window.__tg__webview_set = true;

        expect(isTelegramBrowser(TELEGRAM_ANDROID_BROWSER_UA)).toBe(true);
    });

    it("does not flag ordinary browsers", () => {
        expect(isTelegramBrowser(TELEGRAM_ANDROID_BROWSER_UA)).toBe(false);
        expect(isTelegramBrowser(TELEGRAM_IOS_BROWSER_UA)).toBe(false);
    });
});

describe("isInAppBrowser", () => {
    it("detects a named social app", () => {
        expect(isInAppBrowser(INSTAGRAM_IOS_UA)).toBe(true);
    });

    it("detects an unnamed app through generic webview markers", () => {
        expect(isInAppBrowser(GENERIC_ANDROID_WEBVIEW_UA)).toBe(true);
    });

    it("detects Telegram through the signals inapp-spy does not check", () => {
        expect(isInAppBrowser(TELEGRAM_ANDROID_MINIAPP_UA)).toBe(true);

        window.__tg__webview_set = true;
        expect(isInAppBrowser(TELEGRAM_ANDROID_BROWSER_UA)).toBe(true);
    });

    it("does not flag ordinary browsers", () => {
        expect(isInAppBrowser(TELEGRAM_ANDROID_BROWSER_UA)).toBe(false);
        expect(isInAppBrowser(TELEGRAM_IOS_BROWSER_UA)).toBe(false);
    });
});
