import { test as baseTest, expect } from "@playwright/test";
import { driveLogin, escapeRegex } from "../../fixtures/auth-flow";

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

test.describe("CMS login flow", () => {
    test("logs a user in via the auth provider redirect flow", async ({ page }) => {
        const email = process.env.E2E_USER_EMAIL;
        const password = process.env.E2E_USER_PASSWORD;
        const providerLabel = process.env.E2E_AUTH_PROVIDER_LABEL;
        test.skip(!email || !password || !providerLabel, REQUIRED);
        if (!email || !password || !providerLabel) return;

        const cmsBaseURL = process.env.CMS_BASE_URL!;

        // Drive the exact same login flow global-setup uses — the single shared
        // implementation in fixtures/auth-flow.ts. driveLogin returns only once
        // we're back on the CMS with the sign-in screen gone.
        await driveLogin({ page, baseURL: cmsBaseURL, email, password, providerLabel });

        // The Auth0 SPA SDK uses cacheLocation: "localstorage" and writes keys
        // prefixed with `@@auth0spajs@@::` (see cms/src/auth.ts AUTH0_CACHE_PREFIX).
        // Poll because the SDK writes the cache asynchronously after the
        // callback redirect — the sign-in screen can disappear before the SDK
        // finishes persisting tokens.
        await expect
            .poll(
                () =>
                    page.evaluate(() => {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && key.startsWith("@@auth0spajs@@::")) return true;
                        }
                        return false;
                    }),
                { timeout: 15_000 },
            )
            .toBe(true);
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
            providerLocator.or(page.getByRole("heading", { name: /sign in/i })).first(),
        ).toBeVisible({ timeout: 30_000 });
    });
});
