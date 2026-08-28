import { expect, type Page } from "@playwright/test";
import { ACTIVE_PROVIDER_KEY, type ClientTarget } from "./idp";

/**
 * Drives the login UI rather than injecting a session, so the OIDC redirect,
 * the authorization-code exchange and the sign-out round trip are all real.
 * Slower and more coupled to markup than `loginAs`, so reserve it for specs
 * that are actually about logging in.
 */

const REDIRECT_TIMEOUT = 30_000;

/** Provider buttons only render once the AuthProvider docs have synced. */
export async function waitForProviderChoices(page: Page, labels: string[]): Promise<void> {
    for (const label of labels) {
        await expect(page.getByRole("button", { name: label })).toBeVisible({
            timeout: REDIRECT_TIMEOUT,
        });
    }
}

export async function signInThroughUI(
    page: Page,
    options: { providerLabel: string; persona: string },
): Promise<void> {
    const appOrigin = new URL(page.url()).origin;

    await page.getByRole("button", { name: options.providerLabel }).click();

    // Off to the issuer, which renders its own account chooser.
    await page.waitForURL((url) => url.origin !== appOrigin, { timeout: REDIRECT_TIMEOUT });
    await page.locator(`[data-persona="${options.persona}"]`).click();

    await page.waitForURL((url) => url.origin === appOrigin, { timeout: REDIRECT_TIMEOUT });
}

export async function signOutThroughUI(page: Page): Promise<void> {
    const appOrigin = new URL(page.url()).origin;

    await page.locator('[data-test="sign-out"]').click();
    await page.locator('[data-test="modal-primary-button"]').click();

    // Sign-out leaves for the issuer's end-session endpoint and comes back.
    await page.waitForURL((url) => url.origin === appOrigin, { timeout: REDIRECT_TIMEOUT });
}

/** Provider id the client currently considers active, or null when signed out. */
export async function readActiveProviderId(
    page: Page,
    target: ClientTarget,
): Promise<string | null> {
    return page.evaluate((key) => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw)._id ?? null : null;
        } catch {
            return null;
        }
    }, ACTIVE_PROVIDER_KEY[target]);
}
