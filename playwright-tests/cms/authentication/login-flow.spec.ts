import { cmsPersonaTest as test, expect } from "../../fixtures/persona";
import { waitForAccessMap } from "../../fixtures/readiness";
import {
    readActiveProviderId,
    signInThroughUI,
    signOutThroughUI,
    waitForProviderChoices,
} from "../../fixtures/loginFlow";

/**
 * The only specs that drive the login UI itself — the provider modal, the OIDC
 * redirect, the authorization-code exchange and the sign-out round trip. Every
 * other spec injects a session instead, which is faster and far less coupled to
 * markup, so keep this file small.
 *
 * `unlinked` has no User doc, so signing it in through either provider stamps
 * nothing and leaves no state behind for other specs.
 */
test.describe("CMS login flow", () => {
    test("signs in through the provider's own login page", async ({ page, idp }) => {
        const primary = idp.providers.primary;
        await page.goto("/");

        await waitForProviderChoices(page, [primary.label, idp.providers.secondary.label]);
        await signInThroughUI(page, { providerLabel: primary.label, persona: "unlinked" });

        await waitForAccessMap(page);
        await expect(page.getByRole("navigation").first()).toBeVisible();
        expect(await readActiveProviderId(page, "cms")).toBe(primary.providerId);
    });

    test("signing out returns the user to provider selection", async ({ page, idp }) => {
        const primary = idp.providers.primary;
        await page.goto("/");

        await waitForProviderChoices(page, [primary.label]);
        await signInThroughUI(page, { providerLabel: primary.label, persona: "unlinked" });
        await waitForAccessMap(page);

        await signOutThroughUI(page);

        await waitForProviderChoices(page, [primary.label]);
        expect(await readActiveProviderId(page, "cms")).toBeNull();
    });

    test("switches providers and back without carrying state between them", async ({
        page,
        idp,
    }) => {
        const { primary, secondary } = idp.providers;
        await page.goto("/");
        await waitForProviderChoices(page, [primary.label, secondary.label]);

        // First provider.
        await signInThroughUI(page, { providerLabel: primary.label, persona: "unlinked" });
        await waitForAccessMap(page);
        expect(await readActiveProviderId(page, "cms")).toBe(primary.providerId);

        await signOutThroughUI(page);
        await waitForProviderChoices(page, [secondary.label]);

        // Second provider — the previous session must not survive into it.
        await signInThroughUI(page, { providerLabel: secondary.label, persona: "unlinked" });
        await waitForAccessMap(page);
        expect(await readActiveProviderId(page, "cms")).toBe(secondary.providerId);

        await signOutThroughUI(page);
        await waitForProviderChoices(page, [primary.label]);

        // Back to the first, which is where a stale cache entry would surface.
        await signInThroughUI(page, { providerLabel: primary.label, persona: "unlinked" });
        await waitForAccessMap(page);
        expect(await readActiveProviderId(page, "cms")).toBe(primary.providerId);
    });
});
