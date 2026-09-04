import { appPersonaTest as test, expect } from "../../fixtures/persona";
import {
  signInThroughUI,
  waitForProviderChoices,
} from "../../fixtures/loginFlow";
import { waitForAccessMap } from "../../fixtures/readiness";
import type { Page } from "@playwright/test";

/**
 * Deep links into gated content are the common entry point from a shared link,
 * and the OIDC `redirect_uri` is pinned to the origin — so the destination only
 * survives if the client carries and restores it itself.
 *
 * `blog2-eng` is seeded into `group-private-content`, which a guest never
 * receives, so it renders the unauthenticated not-found page. `blog1-eng` is
 * public and readable without signing in.
 */
const PRIVATE_ARTICLE_PATH = "/blog2-eng";
const PRIVATE_ARTICLE_TITLE = "Blog 2";
const PUBLIC_ARTICLE_PATH = "/blog1-eng";

const REDIRECT_TIMEOUT = 30_000;

/** Login is gated behind policy acceptance, so clear it before driving the prompt. */
async function acceptPrivacyPolicy(page: Page): Promise<void> {
  const accept = page.locator('button[name="accept"]').first();
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

async function startLoginFromNotFoundPage(page: Page): Promise<void> {
  const prompt = page.locator('[data-test="login-prompt"]');
  await expect(prompt).toBeVisible({ timeout: REDIRECT_TIMEOUT });
  await acceptPrivacyPolicy(page);
  await prompt.click();
  await acceptPrivacyPolicy(page);
}

async function currentLocation(page: Page): Promise<string> {
  const url = new URL(page.url());
  return url.pathname + url.search + url.hash;
}

test.describe("App login return-to", () => {
  test("returns to the gated article the login was started from", async ({
    page,
    idp,
  }) => {
    const primary = idp.providers.primary;
    await page.goto(PRIVATE_ARTICLE_PATH);

    await startLoginFromNotFoundPage(page);
    await waitForProviderChoices(page, [primary.label]);
    await signInThroughUI(page, {
      providerLabel: primary.label,
      persona: "privateUser",
    });
    await waitForAccessMap(page);

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: REDIRECT_TIMEOUT })
      .toBe(PRIVATE_ARTICLE_PATH);
    await expect(
      page.getByRole("heading", { name: PRIVATE_ARTICLE_TITLE }).first(),
    ).toBeVisible({ timeout: REDIRECT_TIMEOUT });
  });

  test("preserves the query string and hash of the original link", async ({
    page,
    idp,
  }) => {
    const primary = idp.providers.primary;
    const link = `${PRIVATE_ARTICLE_PATH}?autoplay=true#section`;
    await page.goto(link);

    await startLoginFromNotFoundPage(page);
    await waitForProviderChoices(page, [primary.label]);
    await signInThroughUI(page, {
      providerLabel: primary.label,
      persona: "privateUser",
    });
    await waitForAccessMap(page);

    await expect
      .poll(() => currentLocation(page), { timeout: REDIRECT_TIMEOUT })
      .toBe(link);
  });

  test("leaves no authorization code on the restored article URL", async ({
    page,
    idp,
  }) => {
    const primary = idp.providers.primary;
    await page.goto(PRIVATE_ARTICLE_PATH);

    await startLoginFromNotFoundPage(page);
    await waitForProviderChoices(page, [primary.label]);
    await signInThroughUI(page, {
      providerLabel: primary.label,
      persona: "privateUser",
    });
    await waitForAccessMap(page);

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: REDIRECT_TIMEOUT })
      .toBe(PRIVATE_ARTICLE_PATH);
    const restored = new URL(page.url());
    expect(restored.searchParams.has("code")).toBe(false);
    expect(restored.searchParams.has("state")).toBe(false);
  });

  /**
   * The destination is captured from wherever the user was, so a reader who
   * still lacks access must land back on the article rather than the home page.
   */
  test("returns to the article even when the signed-in user still cannot read it", async ({
    page,
    idp,
  }) => {
    const primary = idp.providers.primary;
    await page.goto(PRIVATE_ARTICLE_PATH);

    await startLoginFromNotFoundPage(page);
    await waitForProviderChoices(page, [primary.label]);
    await signInThroughUI(page, {
      providerLabel: primary.label,
      persona: "publicUser",
    });
    await waitForAccessMap(page);

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: REDIRECT_TIMEOUT })
      .toBe(PRIVATE_ARTICLE_PATH);
    // Signed in now, so the not-found page drops its login prompt.
    await expect(page.locator('[data-test="login-prompt"]')).toHaveCount(0);
  });

  // The top-bar login button is the other entry point into the same redirect,
  // and it only renders below the desktop breakpoint.
  test.describe("from the top-bar login button", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("returns to a readable page the login was started from", async ({
      page,
      idp,
    }) => {
      const primary = idp.providers.primary;
      await page.goto(PUBLIC_ARTICLE_PATH);
      await acceptPrivacyPolicy(page);

      const loginButton = page.locator('[data-test="mobileLoginButton"]');
      await expect(loginButton).toBeVisible({ timeout: REDIRECT_TIMEOUT });
      await loginButton.click();
      await acceptPrivacyPolicy(page);

      await waitForProviderChoices(page, [primary.label]);
      await signInThroughUI(page, {
        providerLabel: primary.label,
        persona: "publicUser",
      });
      await waitForAccessMap(page);

      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: REDIRECT_TIMEOUT })
        .toBe(PUBLIC_ARTICLE_PATH);
    });

    test("stays on the home page when the login was started there", async ({
      page,
      idp,
    }) => {
      const primary = idp.providers.primary;
      await page.goto("/");
      await acceptPrivacyPolicy(page);

      const loginButton = page.locator('[data-test="mobileLoginButton"]');
      await expect(loginButton).toBeVisible({ timeout: REDIRECT_TIMEOUT });
      await loginButton.click();
      await acceptPrivacyPolicy(page);

      await waitForProviderChoices(page, [primary.label]);
      await signInThroughUI(page, {
        providerLabel: primary.label,
        persona: "publicUser",
      });
      await waitForAccessMap(page);

      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: REDIRECT_TIMEOUT })
        .toBe("/");
    });
  });
});
