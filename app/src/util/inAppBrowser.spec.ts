import { describe, it, expect, afterEach } from "vitest";
import { isTelegramBrowser } from "./inAppBrowser";

// Real shapes produced by Telegram's webview code: it strips the "; wv" marker, rewrites the
// device to "K" and drops "Version/", leaving ordinary-looking Chrome/Safari user agents.
const TELEGRAM_ANDROID_BROWSER_UA =
    "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.135 Mobile Safari/537.36";
const TELEGRAM_ANDROID_MINIAPP_UA = `${TELEGRAM_ANDROID_BROWSER_UA} Telegram-Android/11.9.0 (Samsung SM-A155M; Android 14; SDK 34; AVERAGE)`;
const TELEGRAM_IOS_BROWSER_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/22F76 Safari/604.1";

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
