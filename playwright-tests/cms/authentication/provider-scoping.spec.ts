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

        const accessMap = await waitForAccessMap(page);
        expect(Object.keys(accessMap)).toEqual(expect.arrayContaining(persona.reaches));

        // Granted by group-private-editors, which is what the stamp will scope away.
        expect(accessMap["group-private-content"]?.post).toMatchObject({
            edit: true,
            cmsView: true,
        });
        expect(accessMap["group-languages"]?.language).toMatchObject({
            translate: true,
            cmsView: true,
        });
    });

    test("a second provider signs in but loses the user's static groups", async ({
        page,
        loginAs,
    }) => {
        await loginAs("providerScoped", { provider: "secondary" });
        await page.goto("/");

        const accessMap = await waitForAccessMap(page);

        // Authenticated, and not sent back to sign-in — that is what makes the
        // reduction easy to miss.
        await expect(page.getByRole("heading", { name: /sign in/i })).toHaveCount(0);

        // Only the provider-less default mapping survives. group-private-content
        // is granted solely to the private groups, so it disappears entirely.
        expect(Object.keys(accessMap)).toContain("group-public-content");
        expect(Object.keys(accessMap)).not.toContain("group-private-content");

        // group-languages still appears, reached transitively through the default
        // group — but capped at the `view` that grants, so the editing rights are
        // gone. Group presence is a closure over the ACL graph; only the
        // permissions on a group show what was actually lost.
        expect(accessMap["group-languages"]?.language?.view).toBe(true);
        expect(accessMap["group-languages"]?.language?.translate).toBeFalsy();
        expect(accessMap["group-languages"]?.language?.cmsView).toBeFalsy();
    });
});
