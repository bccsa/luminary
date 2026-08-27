import { cmsPersonaTest as test, expect } from "../../fixtures/persona";
import { waitForAccessMap } from "../../fixtures/readiness";
import { personas, type PersonaKey } from "../../fixtures/idp";

/**
 * The AccessMap the API returns on the socket handshake is the whole permission
 * decision, and `luminary-shared` mirrors it into localStorage — so asserting on
 * it checks the real server-side resolution rather than a UI proxy.
 */
test.describe("CMS persona access", () => {
    for (const persona of Object.values(personas)) {
        test(`resolves the seeded groups for ${persona.key}`, async ({ page, loginAs }) => {
            await loginAs(persona.key as PersonaKey);
            await page.goto("/");

            const accessMap = await waitForAccessMap(page);
            expect(Object.keys(accessMap)).toEqual(expect.arrayContaining(persona.reaches));
        });
    }

    test("an editor gets edit rights only where its groups grant them", async ({
        page,
        loginAs,
    }) => {
        await loginAs("editor2");
        await page.goto("/");

        const accessMap = await waitForAccessMap(page);

        // Private-editor membership is what carries editing rights.
        expect(accessMap["group-private-content"]?.post).toMatchObject({
            edit: true,
            publish: true,
            cmsView: true,
        });

        // Public content is reachable only through the default group, which
        // grants reading and nothing more — the group being present in the map
        // is not itself the boundary.
        expect(accessMap["group-public-content"]?.post).toMatchObject({ view: true });
        expect(accessMap["group-public-content"]?.post?.edit).toBeFalsy();
        expect(accessMap["group-public-content"]?.post?.publish).toBeFalsy();
        expect(accessMap["group-public-content"]?.post?.cmsView).toBeFalsy();
    });

    test("a token with no matching User doc gets only the default groups", async ({
        page,
        loginAs,
    }) => {
        await loginAs("unlinked");
        await page.goto("/");

        const accessMap = await waitForAccessMap(page);
        // The provider-less AutoGroupMappings default is all this identity earns.
        expect(Object.keys(accessMap)).toContain("group-public-content");
        expect(Object.keys(accessMap)).not.toContain("group-private-content");
        expect(accessMap["group-public-content"]?.post?.cmsView).toBeFalsy();
    });
});
