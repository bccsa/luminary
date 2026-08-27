import { cmsPersonaTest as test, expect } from "../../fixtures/persona";
import { waitForAccessMap } from "../../fixtures/readiness";
import { readActiveProviderId } from "../../fixtures/loginFlow";

/**
 * The CMS has no unauthenticated state, so anything that drops a session puts
 * the user in front of a login screen. These cover the paths where that would
 * happen without the user doing anything.
 */
test.describe("CMS session persistence", () => {
    test("a reload does not sign the user out", async ({ page, loginAs }) => {
        const persona = await loginAs("editor1");
        await page.goto("/");
        await waitForAccessMap(page);

        await page.reload();

        const groups = Object.keys(await waitForAccessMap(page));
        expect(groups).toEqual(expect.arrayContaining(persona.reaches));
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);
    });

    test("an expired token is refreshed silently instead of forcing a re-login", async ({
        page,
        loginAs,
    }) => {
        // Already expired at boot, so setupAuth takes the signinSilent path and
        // exchanges the refresh token against the issuer's token endpoint.
        const persona = await loginAs("editor1", { expiresInSeconds: -60 });
        await page.goto("/");

        const groups = Object.keys(await waitForAccessMap(page));
        expect(groups).toEqual(expect.arrayContaining(persona.reaches));
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);
    });

    test("the refreshed session stays bound to the provider it came from", async ({
        page,
        loginAs,
        idp,
    }) => {
        await loginAs("editor1", { expiresInSeconds: -60 });
        await page.goto("/");
        await waitForAccessMap(page);

        // A token and the provider it was issued for must always travel together;
        // the API rejects a token that arrives without its provider.
        expect(await readActiveProviderId(page, "cms")).toBe(idp.providers.primary.providerId);
    });
});
