import { cmsPersonaTest as test, expect } from "../../fixtures/persona";
import { waitForAccessMap } from "../../fixtures/readiness";

/**
 * The API stamps a User doc with the provider it first signs in through, then
 * excludes that doc's groups from any other provider — deliberate, so a token
 * carrying the same email from an untrusted issuer cannot inherit an account's
 * permissions. The cost is that the second provider signs in successfully with
 * a silently reduced access map, which the server only records as a log
 * warning. These specs pin that behaviour down so it cannot change unnoticed.
 *
 * Serial because the first sign-in is what applies the stamp the second one
 * depends on. `providerScoped` is reserved for this file for the same reason.
 */
test.describe.serial("CMS provider scoping", () => {
    test("the first provider a user signs in through grants their full access", async ({
        page,
        loginAs,
    }) => {
        const persona = await loginAs("providerScoped", { provider: "primary" });
        await page.goto("/");

        const groups = Object.keys(await waitForAccessMap(page));
        expect(groups).toEqual(expect.arrayContaining(persona.reaches));
    });

    test("a second provider signs in but loses the user's static groups", async ({
        page,
        loginAs,
    }) => {
        await loginAs("providerScoped", { provider: "secondary" });
        await page.goto("/");

        const accessMap = await waitForAccessMap(page);
        const groups = Object.keys(accessMap);

        // Authenticated, and not sent back to sign-in — that is what makes the
        // reduction easy to miss.
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);

        // Only the provider-less default mapping survives.
        expect(groups).toContain("group-public-content");
        expect(groups).not.toContain("group-private-content");
        expect(groups).not.toContain("group-languages");
    });
});
