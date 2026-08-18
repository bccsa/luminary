import { type Page } from "@playwright/test";

/** Escape user-provided text before injecting into a RegExp. */
export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SUBMIT_BUTTON_REGEX = /continue|next|log[ _]?in|sign[ _]?in|submit/i;
const CONSENT_BUTTON_REGEX = /^(authorize|authorise|allow|accept|continue|confirm|approve)\b/i;

export type DriveLoginParams = {
    page: Page;
    baseURL: string;
    email: string;
    password: string;
    providerLabel: string;
    /** Prefixed into thrown error messages so a failure points at the right user. */
    label?: string;
    /** Appended to the credential-rejection error to name the relevant env vars. */
    credentialsHint?: string;
    /** Invoked with a step name just before a failure is thrown, for diagnostics. */
    onFailure?: (step: string) => Promise<void>;
};

/**
 * Drive the real auth provider login UI for an app that redirects
 * unauthenticated users to a hosted login page (the CMS): from the CMS sign-in
 * screen, through the provider's identifier/password (and optional consent)
 * pages, and back to the CMS origin with the sign-in screen gone.
 *
 * Throws on credential rejection or a failed redirect. Shared by global-setup
 * (which then captures storageState) and the login-flow spec (which tests the
 * flow itself), so the brittle UI-driving logic lives in exactly one place.
 */
export async function driveLogin(params: DriveLoginParams): Promise<void> {
    const { page, baseURL, email, password, providerLabel, label, credentialsHint, onFailure } =
        params;
    const who = label ? `${label}: ` : "";
    const appOrigin = new URL(baseURL).origin;

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

    const passwordSelector = 'input[type="password"]:not([aria-hidden="true"]):not(.hide):visible';

    // Step 1: identifier (email). Auth0's New Universal Login splits this into
    // an email page and a password page; some providers do both on one page.
    // Detect which by waiting briefly for either an email field (Step 1) or a
    // password field (single-page) before doing anything.
    const emailField = page
        .locator('input[type="email"]:visible, input[name="username"]:visible')
        .first();
    const passwordOnFirstPage = page.locator(passwordSelector).first();
    await Promise.race([
        emailField.waitFor({ state: "visible", timeout: 30_000 }),
        passwordOnFirstPage.waitFor({ state: "visible", timeout: 30_000 }),
    ]);

    const onSinglePage = await passwordOnFirstPage.isVisible().catch(() => false);
    if (onSinglePage) {
        // Single-page flow (Classic Universal Login): email and password are on
        // the same form. Fill the email here; password-fill and submit happen in
        // the shared step below.
        await emailField.fill(email);
    } else {
        // Two-page flow: fill email, click Continue, then wait for the explicit
        // URL change away from /identifier before looking for the password
        // input — avoiding the race that has us looking at a stale Step 1 DOM.
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

    // Step 2: password. Re-locate the password field on the (now current) page;
    // use real keystrokes (pressSequentially) instead of fill() so any
    // keypress-based listeners or anti-automation guards see real input. Then
    // verify the value actually landed before submitting.
    const passwordField = page.locator(passwordSelector).first();
    await passwordField.waitFor({ state: "visible", timeout: 30_000 });
    await passwordField.click();
    await passwordField.fill(""); // clear any pre-fill / autofill value
    await passwordField.pressSequentially(password, { delay: 20 });

    const enteredValue = await passwordField.inputValue();
    if (enteredValue.length !== password.length) {
        throw new Error(
            `${who}password field did not capture the full password (got ${enteredValue.length} chars, expected ${password.length}). ` +
                "The provider may be using anti-automation guards or a non-standard input.",
        );
    }

    const beforeSubmitUrl = page.url();
    await page
        .getByRole("button", { name: SUBMIT_BUTTON_REGEX })
        .first()
        .click({ timeout: 15_000 })
        .catch(() => passwordField.press("Enter"));

    // After submit, the page either navigates (success path → wait for the URL
    // to change) OR stays put and renders an inline credential error (e.g.
    // "Wrong email or password"). Race the two so a bad password surfaces in a
    // few seconds instead of timing out at 30s.
    const credentialError = page
        .getByText(/(wrong|invalid|incorrect)\b[^.]{0,40}(email|password|credentials|username)/i)
        .first();
    const navigated = page
        .waitForURL((url) => url.toString() !== beforeSubmitUrl, { timeout: 30_000 })
        .then(() => "navigated" as const);
    const errorAppeared = credentialError
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "error" as const)
        .catch(() => null);

    const outcome = await Promise.race([navigated, errorAppeared]);
    if (outcome === "error") {
        const errorText = await credentialError.textContent().catch(() => null);
        await onFailure?.("credentials-rejected");
        throw new Error(
            `${who}auth provider rejected credentials: "${errorText?.trim() ?? "unknown error"}". ` +
                (credentialsHint ?? "Verify the configured E2E credentials match the user on the auth provider."),
        );
    }
    await page.waitForLoadState("domcontentloaded");

    // Some providers insert a consent / authorize screen after a fresh password
    // submit. Click through it if present, then wait for the round-trip back to
    // the CMS. Best-effort — if no consent screen renders we just continue.
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
        await onFailure?.("post-redirect-sign-in-still-visible");
        throw new Error(
            `${who}auth login flow completed but the CMS sign-in screen is still visible. ` +
                "The auth provider may have rejected credentials or the redirect callback failed.",
        );
    }
}
