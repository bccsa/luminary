import { expect, type Page } from "@playwright/test";
import { readActiveProviderId } from "./loginFlow";
import {
  readStoredSession,
  type ClientTarget,
  type ProviderConfig,
} from "./idp";
import { waitForAccessMap, type AccessMap } from "./readiness";

const REDIRECT_TIMEOUT = 30_000;

/**
 * Exercises the complete recovery path for the Auth0-style failure that
 * prompted this regression test:
 *
 * 1. The API rejects an opaque persisted access token on the socket handshake.
 * 2. The refresh grant also returns an opaque token, which the client must not
 *    install and reconnect with.
 * 3. The client falls back to a visible prompt=login authorization redirect.
 * 4. That redirect retains the provider audience and returns a JWT the API
 *    accepts on the fresh socket handshake.
 */
export async function recoverOpaqueTokenThroughLogin(
  page: Page,
  options: {
    target: ClientTarget;
    provider: ProviderConfig & { origin: string; label: string };
    persona: string;
  },
): Promise<AccessMap> {
  const { provider } = options;
  let opaqueRefreshCount = 0;

  await page.route(`${provider.origin}/oauth/token`, async (route) => {
    const params = new URLSearchParams(route.request().postData() ?? "");
    if (params.get("grant_type") !== "refresh_token") {
      await route.continue();
      return;
    }

    opaqueRefreshCount += 1;
    const response = await route.fetch();
    const tokenSet = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: {
        ...tokenSet,
        access_token: `opaque-refreshed-token-${opaqueRefreshCount}`,
      },
    });
  });

  const initialNavigation = await page.goto("/");
  if (!initialNavigation)
    throw new Error("Client navigation did not return a response");
  const clientOrigin = new URL(initialNavigation.url()).origin;

  await page.waitForURL(
    (url) => url.origin === provider.origin && url.pathname === "/authorize",
    { timeout: REDIRECT_TIMEOUT },
  );

  const authorizationUrl = new URL(page.url());
  expect(authorizationUrl.searchParams.get("prompt")).toBe("login");
  expect(authorizationUrl.searchParams.get("audience")).toBe(provider.audience);
  expect(opaqueRefreshCount).toBe(1);

  await page.locator(`[data-persona="${options.persona}"]`).click();
  await page.waitForURL((url) => url.origin === clientOrigin, {
    timeout: REDIRECT_TIMEOUT,
  });

  const accessMap = await waitForAccessMap(page);
  const recovered = await readStoredSession(page, provider);
  expect(recovered?.accessToken.split(".")).toHaveLength(3);
  expect(await readActiveProviderId(page, options.target)).toBe(provider._id);

  const callbackUrl = new URL(page.url());
  expect(callbackUrl.searchParams.has("code")).toBe(false);
  expect(callbackUrl.searchParams.has("state")).toBe(false);
  return accessMap;
}
