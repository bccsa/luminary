import { cmsPersonaTest as test, providerConfig } from "../../fixtures/persona";
import { assertSessionSurvivesUnreachableProvider } from "../../fixtures/providerUnreachable";

/**
 * The counterpart to quiet token recovery: the same stale-token reconnect, but
 * with the token endpoint unreachable rather than answering.
 */
test.describe("CMS unreachable provider", () => {
    test("keeps the session and retries when the token endpoint cannot be reached", async ({
        page,
        loginAs,
        idp,
    }) => {
        const primary = idp.providers.primary;
        const persona = await loginAs("editor1", { expiresInSeconds: 12 });

        await assertSessionSurvivesUnreachableProvider(page, {
            target: "cms",
            provider: { ...providerConfig(primary), origin: primary.origin },
            expectedGroups: persona.reaches,
        });
    });
});
