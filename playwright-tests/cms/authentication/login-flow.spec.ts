import { test as baseTest, expect } from "@playwright/test";

/**
 * The other CMS specs reuse a persisted login from global-setup. This file
 * runs the live Auth0 login UI from a clean slate to verify the flow itself
 * still works end-to-end and to verify the router blocks unauthenticated
 * access. We use Playwright's base `test` directly (no session shim) so
 * nothing pre-authenticates the page.
 */
const test = baseTest;
test.use({ storageState: { cookies: [], origins: [] } });

const REQUIRED =
    "E2E_USER_EMAIL, E2E_USER_PASSWORD, and E2E_AUTH_PROVIDER_LABEL must be set in the env";

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("CMS login flow", () => {
    test("logs a user in via the auth provider redirect flow", async ({ page }) => {
        const email = process.env.E2E_USER_EMAIL;
        const password = process.env.E2E_USER_PASSWORD;
        const providerLabel = process.env.E2E_AUTH_PROVIDER_LABEL;
        test.skip(!email || !password || !providerLabel, REQUIRED);
        if (!email || !password || !providerLabel) return;

        const cmsBaseURL = process.env.CMS_BASE_URL!;
        const cmsOrigin = new URL(cmsBaseURL).origin;

        await page.goto(cmsBaseURL, { waitUntil: "domcontentloaded" });

        const provider = page
            .getByRole("button", { name: new RegExp(escapeRegex(providerLabel), "i") })
            .first();
        await provider.waitFor({ state: "visible", timeout: 15_000 });
        await provider.click();

        // Redirect to the hosted login.
        await page.waitForURL((url) => url.origin !== cmsOrigin, { timeout: 30_000 });

        const emailField = page
            .locator('input[type="email"]:visible, input[name="username"]:visible')
            .first();
        await emailField.waitFor({ state: "visible", timeout: 30_000 });
        await emailField.fill(email);
        await page
            .getByRole("button", {
                name: /continue|next|log[ _]?in|sign[ _]?in|submit/i,
            })
            .first()
            .click();

        const passwordField = page
            .locator('input[type="password"]:not([aria-hidden="true"]):not(.hide):visible')
            .first();
        await passwordField.waitFor({ state: "visible", timeout: 30_000 });
        await passwordField.fill(password);
        await page
            .getByRole("button", { name: /continue|log[ _]?in|sign[ _]?in|submit/i })
            .first()
            .click();

        // Back on the CMS — sign-in screen should be gone.
        await page.waitForURL((url) => url.origin === cmsOrigin, { timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);

        // The Auth0 SPA SDK uses cacheLocation: "localstorage" — at least one
        // entry whose key starts with the SDK prefix should now exist.
        const hasAuthCache = await page.evaluate(() => {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith("@@auth0spajs::")) return true;
            }
            return false;
        });
        expect(hasAuthCache).toBe(true);
    });

    test("blocks unauthenticated access to the CMS", async ({ page }) => {
        const cmsBaseURL = process.env.CMS_BASE_URL!;
        const providerLabel = process.env.E2E_AUTH_PROVIDER_LABEL;

        await page.goto(`${cmsBaseURL}/post/overview/blog`, { waitUntil: "domcontentloaded" });

        // Either the provider modal/sign-in screen renders, or the user is
        // redirected away from the protected route. We assert the presence of
        // a sign-in entry point — the configured provider button if one is
        // set, or a generic "Sign in" heading as a fallback.
        const providerLocator = providerLabel
            ? page.getByRole("button", {
                  name: new RegExp(escapeRegex(providerLabel), "i"),
              })
            : page.getByRole("button", { name: /sign in/i });

        await expect(
            providerLocator.or(page.getByRole("heading", { name: /sign in/i })),
        ).toBeVisible({ timeout: 30_000 });
    });
});
