import type { Page } from "@playwright/test";
import { appTest as test, expect } from "../../fixtures/test";

/**
 * The app mounts only after the database, sync and auth have initialised, so everything
 * before mount paints an empty `#app` unless the build injects a splash — and a boot that
 * stalls in that window leaves the user with nothing reported at all. These cover the
 * splash and the recovery paths it reports through: bounded database opens, and a
 * language wait that gives up.
 */

/**
 * Replaces the IndexedDB open the boot path starts with. `blocked` is what a browser
 * reports while another connection still holds an older version open — a wait that clears
 * itself. `error` is an open that genuinely cannot succeed.
 */
async function breakIndexedDbOpen(page: Page, mode: "blocked" | "error") {
  await page.addInitScript((stubMode) => {
    Object.defineProperty(window.indexedDB, "open", {
      configurable: true,
      value: () => {
        const request: Record<string, unknown> = {};
        setTimeout(() => {
          const handler = stubMode === "blocked" ? "onblocked" : "onerror";
          (request[handler] as (() => void) | undefined)?.();
        }, 0);
        return request;
      },
    });
  }, mode);
}

test.describe("App boot recovery", () => {
  test("serves the boot splash alongside #app", async ({ page }) => {
    // Asserted against the raw HTML because the splash is injected by a string
    // replace on `<div id="app"></div>`, which no-ops silently if that markup
    // ever changes — leaving the pre-mount window blank again.
    const html = await (await page.request.get("/")).text();

    expect(html).toMatch(/<div id="app"><\/div>\s*<div id="boot-splash"/);
  });

  test("removes the boot splash once the app mounts", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("#boot-splash")).toHaveCount(0);
  });

  test.describe("before scripts run", () => {
    // Approximates the pre-mount window: the splash has to stand on its own markup
    // and CSS, with no help from the bundle.
    test.use({ javaScriptEnabled: false });

    test("covers the viewport", async ({ page }) => {
      await page.goto("/");

      await expect(page.locator("#boot-splash")).toBeVisible();
      await expect(page.locator("#boot-splash")).toContainText("Loading");
    });
  });

  test("keeps waiting, not failing, while the database open is blocked", async ({
    page,
  }) => {
    // Another connection holding an older version open is a state that clears itself when
    // that connection closes, so the boot waits on the splash rather than declaring failure.
    await breakIndexedDbOpen(page, "blocked");
    await page.goto("/");

    await expect(page.locator("#boot-splash")).toBeVisible();
    await expect(page.locator("#boot-splash .boot-splash-error")).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-render-state",
      "error",
    );
  });

  test("reports an error when the database open fails", async ({ page }) => {
    await breakIndexedDbOpen(page, "error");
    await page.goto("/");

    await expect(page.locator("#boot-splash .boot-splash-error")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-render-state",
      "error",
    );
  });

  test("does not strand the splash when the socket never connects", async ({
    page,
  }) => {
    // Only the socket is blocked — REST stays reachable. Language docs are a
    // fully-synced type whose sync is gated on `isConnected`, so a client that
    // cannot open a socket never receives them, and `initLanguage()` is awaited
    // between mount and the splash being cleared.
    await page.route("**/socket.io/**", (route) => route.abort());
    await page.goto("/");

    // Mounted: the static splash is gone, so the boot path got past app.mount().
    await expect(page.locator("#boot-splash")).toHaveCount(0);

    // The app must still become usable offline rather than sitting on the splash.
    await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
  });
});
