import { chromium, type FullConfig, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(__dirname, "../.auth");

/** Escape user-provided text before injecting into a RegExp. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Capture sessionStorage from the current page. Playwright's storageState only
 * persists cookies + localStorage (+ IndexedDB when requested), so tokens
 * stored in sessionStorage must be captured separately and re-injected via
 * addInitScript in a test fixture.
 */
async function dumpSessionStorage(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const out: Record<string, string> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key) out[key] = sessionStorage.getItem(key) ?? "";
        }
        return out;
    });
}

/**
 * Visit a URL and save whatever storage state results. Used for the App,
 * which allows guest browsing and does not require authentication for the
 * smoke tests.
 */
async function saveGuestState(baseURL: string, storageStatePath: string) {
    const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 100 : 0 });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({ path: storageStatePath });
    await browser.close();
}

type LoginParams = {
    baseURL: string;
    email: string;
    password: string;
    storageStatePath: string;
    sessionStoragePath: string;
    /** Used in error messages so a failure points at the right user. */
    label: string;
};

const SUBMIT_BUTTON_REGEX = /continue|next|log[ _]?in|sign[ _]?in|submit/i;
const CONSENT_BUTTON_REGEX = /^(authorize|authorise|allow|accept|continue|confirm|approve)\b/i;

/**
 * Honoured for debugging the global-setup login flow:
 *   HEADED=1 npm test         # see the browser
 *   PWDEBUG=1 npm test        # Playwright's own debug mode
 * Playwright's `--headed` flag only affects test workers, not globalSetup.
 */
const HEADED =
    process.env.HEADED === "1" ||
    process.env.HEADED === "true" ||
    process.env.PWDEBUG === "1" ||
    process.env.PWDEBUG === "console";

/**
 * Capture diagnostics — current URL, page title, and a screenshot — so a
 * failing global setup leaves enough breadcrumbs to triage without re-running.
 */
async function dumpDiagnostics(page: Page, label: string, step: string) {
    fs.mkdirSync(authDir, { recursive: true });
    const safe = `${label}-${step}`.replace(/[^a-z0-9-_]+/gi, "_");
    const shotPath = path.join(authDir, `login-failure-${safe}.png`);
    try {
        await page.screenshot({ path: shotPath, fullPage: true });
    } catch {
        // Best effort.
    }
    let url = "<unknown>";
    let title = "<unknown>";
    try {
        url = page.url();
    } catch {
        // Best effort.
    }
    try {
        title = await page.title();
    } catch {
        // Best effort.
    }
    console.error(
        `\n[global-setup] login failed for ${label} at step "${step}":\n  url:   ${url}\n  title: ${title}\n  shot:  ${shotPath}\n`,
    );
}

/**
 * Drive the real auth provider login UI for an app that redirects
 * unauthenticated users to a hosted login page (the CMS).
 */
async function loginAndSaveState(params: LoginParams) {
    const { baseURL, email, password, storageStatePath, sessionStoragePath, label } = params;

    const providerLabel = process.env.E2E_AUTH_PROVIDER_LABEL;
    if (!providerLabel) {
        throw new Error(
            "E2E_AUTH_PROVIDER_LABEL must be set (via .env file or environment) before running tests. " +
                "It is the visible name of the auth provider button on the CMS sign-in screen.",
        );
    }

    const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 100 : 0 });
    const context = await browser.newContext();
    const page = await context.newPage();

    const appOrigin = new URL(baseURL).origin;

    try {
        await page.goto(baseURL, { waitUntil: "domcontentloaded" });

        // Click the configured auth provider button on the CMS sign-in screen.
        const providerButton = page
            .getByRole("button", { name: new RegExp(escapeRegex(providerLabel), "i") })
            .first();
        await providerButton.waitFor({ state: "visible", timeout: 15_000 });
        await providerButton.click();

        // Wait for redirect off CMS origin onto the hosted auth provider login page.
        await page.waitForURL((url) => url.origin !== appOrigin, { timeout: 30_000 });
        await page.waitForLoadState("domcontentloaded");

        const passwordSelector =
            'input[type="password"]:not([aria-hidden="true"]):not(.hide):visible';

        // Step 1: identifier (email). Auth0's New Universal Login splits this
        // into an email page and a password page; some providers do both on
        // one page. Detect which by waiting briefly for either an email field
        // (Step 1) or a password field (single-page) before doing anything.
        const emailField = page
            .locator('input[type="email"]:visible, input[name="username"]:visible')
            .first();
        const passwordOnFirstPage = page.locator(passwordSelector).first();
        await Promise.race([
            emailField.waitFor({ state: "visible", timeout: 30_000 }),
            passwordOnFirstPage.waitFor({ state: "visible", timeout: 30_000 }),
        ]);

        const onSinglePage = await passwordOnFirstPage.isVisible().catch(() => false);
        if (!onSinglePage) {
            // Two-page flow: fill email, click Continue, then wait for the
            // explicit URL change away from /identifier (or whatever the
            // first page was) before looking for the password input. Avoiding
            // the race that has us looking at a stale Step 1 DOM.
            const beforeUrl = page.url();
            await emailField.fill(email);
            await Promise.all([
                page.waitForURL((url) => url.toString() !== beforeUrl, { timeout: 30_000 }),
                page
                    .getByRole("button", { name: SUBMIT_BUTTON_REGEX })
                    .first()
                    .click({ timeout: 15_000 })
                    .catch(() => emailField.press("Enter")),
            ]);
            await page.waitForLoadState("domcontentloaded");
        }

        // Step 2: password. Re-locate the password field on the (now current)
        // page; use real keystrokes (pressSequentially) instead of fill() so
        // any keypress-based listeners or anti-automation guards see real
        // input. Then verify the value actually landed before submitting.
        const passwordField = page.locator(passwordSelector).first();
        await passwordField.waitFor({ state: "visible", timeout: 30_000 });
        await passwordField.click();
        await passwordField.fill(""); // clear any pre-fill / autofill value
        await passwordField.pressSequentially(password, { delay: 20 });

        const enteredValue = await passwordField.inputValue();
        if (enteredValue.length !== password.length) {
            throw new Error(
                `Password field did not capture the full password (got ${enteredValue.length} chars, expected ${password.length}). ` +
                    "The provider may be using anti-automation guards or a non-standard input.",
            );
        }

        const beforeSubmitUrl = page.url();
        await Promise.all([
            page.waitForURL((url) => url.toString() !== beforeSubmitUrl, { timeout: 30_000 }),
            page
                .getByRole("button", { name: SUBMIT_BUTTON_REGEX })
                .first()
                .click({ timeout: 15_000 })
                .catch(() => passwordField.press("Enter")),
        ]);
        await page.waitForLoadState("domcontentloaded");

        // Some providers insert a consent / authorize screen after a fresh
        // password submit. Click through it if present, then wait for the
        // round-trip back to CMS. Best-effort — if no consent screen renders
        // we just continue.
        const consentButton = page.getByRole("button", { name: CONSENT_BUTTON_REGEX }).first();
        await consentButton
            .waitFor({ state: "visible", timeout: 5_000 })
            .then(() => consentButton.click().catch(() => {}))
            .catch(() => {});

        // Wait until we're back on the CMS origin after the auth round-trip.
        await page.waitForURL((url) => url.origin === appOrigin, { timeout: 60_000 });
        await page.waitForLoadState("networkidle").catch(() => {});

        // Strictly verify the sign-in screen is gone — otherwise auth didn't land.
        const signInHeading = page.getByRole("heading", { name: /sign in/i });
        try {
            await signInHeading.waitFor({ state: "hidden", timeout: 30_000 });
        } catch {
            await dumpDiagnostics(page, label, "post-redirect-sign-in-still-visible");
            throw new Error(
                `Auth login flow completed for ${label} but the CMS sign-in screen is still visible. ` +
                    "The auth provider may have rejected credentials or the redirect callback failed. " +
                    "See the screenshot in playwright-tests/.auth/.",
            );
        }

        fs.mkdirSync(authDir, { recursive: true });
        // indexedDB: true (Playwright 1.51+) also captures IndexedDB — the new
        // auth provider stashes tokens there.
        await context.storageState({ path: storageStatePath, indexedDB: true });

        // Save sessionStorage separately — storageState() does not capture it.
        const sessionData = await dumpSessionStorage(page);
        fs.writeFileSync(sessionStoragePath, JSON.stringify(sessionData, null, 2));
    } catch (err) {
        // Capture whatever the page looks like so the user can diagnose.
        await dumpDiagnostics(page, label, "exception");
        throw err;
    } finally {
        await browser.close();
    }
}

export default async function globalSetup(_config: FullConfig) {
    const appBaseURL = process.env.APP_BASE_URL;
    const cmsBaseURL = process.env.CMS_BASE_URL;

    if (!appBaseURL || !cmsBaseURL) {
        throw new Error(
            "APP_BASE_URL and CMS_BASE_URL must be set (via .env file or environment) before running tests.",
        );
    }

    const user1Email = process.env.E2E_USER_EMAIL;
    const user1Password = process.env.E2E_USER_PASSWORD;

    if (!user1Email || !user1Password) {
        throw new Error(
            "E2E_USER_EMAIL and E2E_USER_PASSWORD must be set (via .env file or environment) before running tests.",
        );
    }

    // App permits guest browsing — no login required for smoke tests.
    await saveGuestState(appBaseURL, path.join(authDir, "app.json"));

    // CMS requires authentication and redirects to the hosted auth provider.
    await loginAndSaveState({
        baseURL: cmsBaseURL,
        email: user1Email,
        password: user1Password,
        storageStatePath: path.join(authDir, "cms.json"),
        sessionStoragePath: path.join(authDir, "cms-session.json"),
        label: "user 1",
    });

    // User 2 is optional: only log in if both creds are present. Specs that
    // require the second user assert on its presence themselves and skip if
    // unset, so global setup just produces the artifacts when it can.
    const user2Email = process.env.E2E_USER_2_EMAIL;
    const user2Password = process.env.E2E_USER_2_PASSWORD;

    if (user2Email && user2Password) {
        await loginAndSaveState({
            baseURL: cmsBaseURL,
            email: user2Email,
            password: user2Password,
            storageStatePath: path.join(authDir, "cms-user2.json"),
            sessionStoragePath: path.join(authDir, "cms-user2-session.json"),
            label: "user 2",
        });
    }
}
