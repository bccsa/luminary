import { cmsPersonaTest as test, providerConfig } from "../../fixtures/persona";
import { recoverOpaqueTokenThroughLogin } from "../../fixtures/authRecovery";

test.describe("CMS opaque-token recovery", () => {
  test("keeps the API audience when recovery requires a visible login", async ({
    page,
    loginAs,
    idp,
  }) => {
    const primary = idp.providers.primary;
    await loginAs("unlinked", { accessToken: "opaque-persisted-token" });

    await recoverOpaqueTokenThroughLogin(page, {
      target: "cms",
      provider: {
        ...providerConfig(primary),
        origin: primary.origin,
        label: primary.label,
      },
      persona: "unlinked",
    });
  });
});
