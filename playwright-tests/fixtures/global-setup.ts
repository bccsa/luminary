import { chromium, type FullConfig, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

/**
 * Visit a URL and save whatever storage state results. Used for the App,
 * which allows guest browsing and does not require authentication for the
 * smoke tests.
 */
async function saveGuestState(baseURL: string, storageStatePath: string) {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    fs.mkdirSync(authDir, { recursive: true });
    await context.storageState({ path: storageStatePath });
    await browser.close();
}

/**
 * Drive the real auth provider login UI for an app that redirects
 * unauthenticated users to a hosted login page (the CMS).
 */
async function loginAndSaveState(
    baseURL: string,
    storageStatePath: string,
    sessionStoragePath: string,
) {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;

    if (!email || !password) {
        throw new Error(
            "E2E_USER_EMAIL and E2E_USER_PASSWORD must be set (via .env file or environment) before running tests.",
        );
    }

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const appOrigin = new URL(baseURL).origin;

    await page.goto(baseURL, { waitUntil: "domcontentloaded" });

    // Click the "BCC Africa Guest" provider button on the CMS sign-in screen.
    const guestProviderButton = page.getByRole("button", { name: /BCC Africa Guest/i }).first();
    await guestProviderButton.waitFor({ state: "visible", timeout: 15_000 });
    await guestProviderButton.click();

    // Wait for redirect off CMS origin onto the hosted auth provider login page.
    await page.waitForURL((url) => url.origin !== appOrigin, { timeout: 30_000 });

    const emailField = page
        .locator('input[type="email"]:visible, input[name="username"]:visible')
        .first();
    await emailField.waitFor({ state: "visible", timeout: 30_000 });
    await emailField.fill(email);

    // Two-step login: submit email first to reveal the password screen.
    await page
        .getByRole("button", { name: /continue|next|log[ _]?in|sign[ _]?in|submit/i })
        .first()
        .click();

    // Filter out the honeypot password field (class="hide", aria-hidden="true").
    const passwordField = page
        .locator('input[type="password"]:not([aria-hidden="true"]):not(.hide):visible')
        .first();
    await passwordField.waitFor({ state: "visible", timeout: 30_000 });
    await passwordField.fill(password);

    await page
        .getByRole("button", { name: /continue|log[ _]?in|sign[ _]?in|submit/i })
        .first()
        .click();

    // Wait until we're back on the CMS origin after the auth round-trip.
    await page.waitForURL((url) => url.origin === appOrigin, { timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Strictly verify the sign-in screen is gone — otherwise auth didn't land.
    const signInHeading = page.getByRole("heading", { name: /sign in/i });
    try {
        await signInHeading.waitFor({ state: "hidden", timeout: 30_000 });
    } catch {
        throw new Error(
            "Auth login flow completed but the CMS sign-in screen is still visible. " +
                "The auth provider may have rejected credentials or the redirect callback failed.",
        );
    }

    fs.mkdirSync(authDir, { recursive: true });
    // indexedDB: true (Playwright 1.51+) also captures IndexedDB — the new
    // auth provider stashes tokens there.
    await context.storageState({ path: storageStatePath, indexedDB: true });

    // Save sessionStorage separately — storageState() does not capture it.
    const sessionData = await dumpSessionStorage(page);
    fs.writeFileSync(sessionStoragePath, JSON.stringify(sessionData, null, 2));

    await browser.close();
}

/**
 * Bring up the fake OIDC issuer and register it as an AuthProvider. Opted into
 * by pointing E2E_COUCHDB_URL at the stack under test; unset, the suite targets
 * a deployed environment instead. Returns the issuer's teardown.
 */
async function setupFakeIdp(appBaseURL: string, cmsBaseURL: string): Promise<() => Promise<void>> {
    const { startE2eIdp, assertServing, DEFAULT_IDP_PORT } = await import("./idp");
    const apiURL = process.env.E2E_API_URL ?? "http://localhost:3000";

    // Probe everything before starting the issuer: a stack that is only partly up
    // otherwise fails much later as an unexplained timeout inside a spec.
    await Promise.all([
        assertServing("The API", `${apiURL}/protected`, "Start it with: npm start (in api/)"),
        assertServing("The App", appBaseURL, "Start it with: npm run dev (in app/)"),
        assertServing("The CMS", cmsBaseURL, "Start it with: npm run dev (in cms/)"),
    ]);

    const { env, stop } = await startE2eIdp({
        couch: {
            connectionString: process.env.E2E_COUCHDB_URL as string,
            database: process.env.E2E_COUCHDB_DATABASE ?? "luminary",
        },
        logoutRedirectOrigins: [appBaseURL, cmsBaseURL],
        port: Number(process.env.E2E_IDP_PORT ?? DEFAULT_IDP_PORT),
    });

    const listed = Object.values(env.providers)
        .map((p) => `    ${p.label}: ${p.origin} (${p.providerId})`)
        .join("\n");
    console.log(
        `Fake IdP issuers listening:\n${listed}\n` +
            "  The API must run with AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true to accept their tokens.",
    );
    return stop;
}

export default async function globalSetup(_config: FullConfig) {
    const appBaseURL = process.env.APP_BASE_URL;
    const cmsBaseURL = process.env.CMS_BASE_URL;

    if (!appBaseURL || !cmsBaseURL) {
        throw new Error(
            "APP_BASE_URL and CMS_BASE_URL must be set (via .env file or environment) before running tests.",
        );
    }

    // Specs pick an identity per test via the persona fixture, so this mode needs
    // no shared storageState and skips the browser launches that would build it.
    if (process.env.E2E_COUCHDB_URL) {
        return setupFakeIdp(appBaseURL, cmsBaseURL);
    }

    // App permits guest browsing — no login required for smoke tests.
    await saveGuestState(appBaseURL, path.join(authDir, "app.json"));

    // CMS requires authentication and redirects to the hosted auth provider.
    await loginAndSaveState(
        cmsBaseURL,
        path.join(authDir, "cms.json"),
        path.join(authDir, "cms-session.json"),
    );
}
