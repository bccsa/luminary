import type { Page } from "@playwright/test";
import { appTest as test, expect } from "../../fixtures/test";

/**
 * Real user agents from the apps themselves. Telegram rewrites its own to look like
 * an ordinary Chrome or Safari string, so the untagged cases below depend on the
 * properties it injects into `window` instead.
 */
const USER_AGENTS = {
    telegramMiniApp:
        "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.135 Mobile Safari/537.36 Telegram-Android/11.9.0 (Samsung SM-A155M; Android 14; SDK 34; AVERAGE)",
    telegramUntagged:
        "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.135 Mobile Safari/537.36",
    instagram:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.5.32.98 (iPhone14,2; iOS 17_5; en_US)",
    androidWebview:
        "Mozilla/5.0 (Linux; Android 14; SM-A155M Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.135 Mobile Safari/537.36",
    chrome: "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.135 Mobile Safari/537.36",
};

const MODAL = '[data-test="modal-container"]';
const CONTINUE = '[data-test="modal-primary-button"]';
const CANCEL = '[data-test="modal-secondary-button"]';

/**
 * The interstitial's copy is CMS-managed, so these assert the route and the dialog
 * rather than any wording.
 */
async function expectInterstitial(page: Page, target = "/") {
    await page.waitForURL((url) => url.pathname === "/open");
    expect(new URL(page.url()).searchParams.get("to")).toBe(target);
    await expect(page.locator(MODAL)).toBeVisible();
}

async function expectNoInterstitial(page: Page) {
    // The app has to have rendered before its absence means anything.
    await expect(page.getByRole("main")).toBeVisible();
    expect(new URL(page.url()).pathname).not.toBe("/open");
    await expect(page.locator(MODAL)).toBeHidden();
}

test.describe("In-app browser warning", () => {
    test.describe("Telegram, user agent tagged", () => {
        test.use({ userAgent: USER_AGENTS.telegramMiniApp });

        test("warns when the user agent names Telegram", async ({ page }) => {
            await page.goto("/", { waitUntil: "domcontentloaded" });

            await expectInterstitial(page);
        });
    });

    test.describe("Telegram, user agent untagged", () => {
        test.use({ userAgent: USER_AGENTS.telegramUntagged });

        test("warns on the injected bridge", async ({ page, context }) => {
            await context.addInitScript(() => {
                (window as unknown as { TelegramWebviewProxy: unknown }).TelegramWebviewProxy = {
                    postEvent: () => {},
                };
            });

            await page.goto("/", { waitUntil: "domcontentloaded" });

            await expectInterstitial(page);
        });

        test("warns on the Android extension marker", async ({ page, context }) => {
            await context.addInitScript(() => {
                (window as unknown as { __tg__webview_set: boolean }).__tg__webview_set = true;
            });

            await page.goto("/", { waitUntil: "domcontentloaded" });

            await expectInterstitial(page);
        });

        // Control for the two above: the same user agent is indistinguishable from
        // Chrome's, so without an injected signal there is nothing left to detect.
        test("does not warn on the user agent alone", async ({ page }) => {
            await page.goto("/", { waitUntil: "domcontentloaded" });

            await expectNoInterstitial(page);
        });
    });

    test.describe("A named social app", () => {
        test.use({ userAgent: USER_AGENTS.instagram });

        test("warns inside Instagram", async ({ page }) => {
            await page.goto("/", { waitUntil: "domcontentloaded" });

            await expectInterstitial(page);
        });
    });

    test.describe("An unnamed app", () => {
        test.use({ userAgent: USER_AGENTS.androidWebview });

        test("warns on generic webview markers", async ({ page }) => {
            await page.goto("/", { waitUntil: "domcontentloaded" });

            await expectInterstitial(page);
        });
    });

    test.describe("An ordinary browser", () => {
        test.use({ userAgent: USER_AGENTS.chrome });

        test("does not warn", async ({ page }) => {
            await page.goto("/", { waitUntil: "domcontentloaded" });

            await expectNoInterstitial(page);
        });
    });

    test.describe("Dismissing the warning", () => {
        test.use({ userAgent: USER_AGENTS.instagram });

        test("continues to the originally requested path", async ({ page }) => {
            await page.goto("/explore", { waitUntil: "domcontentloaded" });
            await expectInterstitial(page, "/explore");

            await page.locator(CONTINUE).click();

            await page.waitForURL((url) => url.pathname === "/explore");
            await expect(page.locator(MODAL)).toBeHidden();
        });

        test("does not warn again for the rest of the tab's session", async ({ page }) => {
            await page.goto("/", { waitUntil: "domcontentloaded" });
            await expectInterstitial(page);
            await page.locator(CONTINUE).click();
            await page.waitForURL((url) => url.pathname === "/");

            await page.reload({ waitUntil: "domcontentloaded" });

            await expectNoInterstitial(page);
        });

        test("cancelling leaves the interstitial for the app", async ({ page }) => {
            await page.goto("/", { waitUntil: "domcontentloaded" });
            await expectInterstitial(page);

            await page.locator(CANCEL).click();

            await expect(page.locator(MODAL)).toBeHidden();
            expect(new URL(page.url()).pathname).not.toBe("/open");
        });
    });
});
