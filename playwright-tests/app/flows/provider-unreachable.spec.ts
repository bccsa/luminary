import { appPersonaTest as test, providerConfig } from "../../fixtures/persona";
import { assertSessionSurvivesUnreachableProvider } from "../../fixtures/providerUnreachable";

/**
 * The app can fall back to guest browsing, which makes losing a session quieter
 * here than in the CMS and so easier to ship unnoticed: content keeps rendering,
 * only the user's own groups silently drop away.
 */
test.describe("App unreachable provider", () => {
    test("keeps the session and retries when the token endpoint cannot be reached", async ({
        page,
        loginAs,
        idp,
    }) => {
        const primary = idp.providers.primary;
        const persona = await loginAs("editor1", { expiresInSeconds: 12 });

        await assertSessionSurvivesUnreachableProvider(page, {
            target: "app",
            provider: { ...providerConfig(primary), origin: primary.origin },
            expectedGroups: persona.reaches,
        });
    });
});
