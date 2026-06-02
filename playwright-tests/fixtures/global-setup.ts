import { chromium, type FullConfig, type Page, type BrowserContext } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { driveLogin } from "./auth-flow";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(__dirname, "../.auth");

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

/** Seed a saved sessionStorage dump into a context, mirroring fixtures/test.ts. */
async function seedSessionStorage(context: BrowserContext, sessionStoragePath: string) {
    const data = JSON.parse(fs.readFileSync(sessionStoragePath, "utf8")) as Record<string, string>;
    await context.addInitScript((entries) => {
        for (const [key, value] of Object.entries(entries)) {
            sessionStorage.setItem(key, value as string);
        }
    }, data);
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
 * Force a fresh UI login even when a valid cached session exists:
 *   E2E_FORCE_LOGIN=1 npm test
 */
const FORCE_LOGIN =
    process.env.E2E_FORCE_LOGIN === "1" || process.env.E2E_FORCE_LOGIN === "true";

/** Sidecar recording which user a captured state belongs to. */
function metaPathFor(storageStatePath: string): string {
    return `${storageStatePath}.meta.json`;
}

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
 * Drive the real auth provider login UI (via the shared driveLogin helper) and
 * persist the resulting authenticated state to disk.
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

    const credentialsHint =
        label === "user 1"
            ? "Verify E2E_USER_EMAIL/E2E_USER_PASSWORD matches the user's credentials on the configured auth provider."
            : "Verify E2E_USER_2_EMAIL/E2E_USER_2_PASSWORD matches the user's credentials on the configured auth provider.";

    try {
        await driveLogin({
            page,
            baseURL,
            email,
            password,
            providerLabel,
            label,
            credentialsHint,
            onFailure: (step) => dumpDiagnostics(page, label, step),
        });

        fs.mkdirSync(authDir, { recursive: true });
        // indexedDB: true (Playwright 1.51+) also captures IndexedDB — the new
        // auth provider stashes tokens there.
        await context.storageState({ path: storageStatePath, indexedDB: true });

        // Save sessionStorage separately — storageState() does not capture it.
        const sessionData = await dumpSessionStorage(page);
        fs.writeFileSync(sessionStoragePath, JSON.stringify(sessionData, null, 2));

        // Record which user this capture belongs to, so a later run can detect a
        // changed E2E_*_EMAIL and re-login instead of reusing the wrong session.
        fs.writeFileSync(metaPathFor(storageStatePath), JSON.stringify({ email }, null, 2));
    } catch (err) {
        // Capture whatever the page looks like so the user can diagnose.
        await dumpDiagnostics(page, label, "exception");
        throw err;
    } finally {
        await browser.close();
    }
}

/** True when the sidecar records the same user we're about to authenticate. */
function identityMatches(storageStatePath: string, email: string): boolean {
    try {
        const meta = JSON.parse(fs.readFileSync(metaPathFor(storageStatePath), "utf8"));
        return meta?.email === email;
    } catch {
        return false;
    }
}

/**
 * Load the cached state into a throwaway context and confirm it still lands
 * authenticated (sign-in screen hidden). Provider-agnostic: it exercises the
 * real session — including any silent token refresh via the SSO cookie —
 * instead of parsing token internals that may live in localStorage or
 * IndexedDB depending on the provider.
 */
async function cachedSessionStillValid(params: LoginParams): Promise<boolean> {
    const { baseURL, storageStatePath, sessionStoragePath } = params;
    if (!fs.existsSync(storageStatePath) || !fs.existsSync(sessionStoragePath)) return false;

    const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 100 : 0 });
    try {
        const context = await browser.newContext({ storageState: storageStatePath });
        try {
            await seedSessionStorage(context, sessionStoragePath);
        } catch {
            return false; // corrupt session dump → treat as invalid
        }
        const page = await context.newPage();
        await page.goto(baseURL, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: /sign in/i }).waitFor({
            state: "hidden",
            timeout: 10_000,
        });
        return true;
    } catch {
        return false;
    } finally {
        await browser.close();
    }
}

/**
 * Reuse a cached authenticated session when one exists for the same user and
 * still validates; otherwise drive the UI login once and persist fresh state.
 * This is the core of "log in once, cache via storageState" — without it the
 * brittle third-party login UI runs on every invocation.
 */
async function ensureSession(params: LoginParams) {
    if (FORCE_LOGIN) {
        console.log(`[global-setup] E2E_FORCE_LOGIN set — forcing fresh login for ${params.label}.`);
    } else if (
        identityMatches(params.storageStatePath, params.email) &&
        (await cachedSessionStillValid(params))
    ) {
        console.log(
            `[global-setup] reusing cached session for ${params.label} (${params.storageStatePath}).`,
        );
        return;
    }

    console.log(`[global-setup] logging in ${params.label} via the auth provider UI.`);
    await loginAndSaveState(params);
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
    await ensureSession({
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
        await ensureSession({
            baseURL: cmsBaseURL,
            email: user2Email,
            password: user2Password,
            storageStatePath: path.join(authDir, "cms-user2.json"),
            sessionStoragePath: path.join(authDir, "cms-user2-session.json"),
            label: "user 2",
        });
    }
}
