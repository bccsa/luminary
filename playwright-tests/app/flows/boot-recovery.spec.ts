import type { Page } from "@playwright/test";
import { appTest as test, expect } from "../../fixtures/test";

/**
 * The app mounts only after the database, sync and auth have initialised, and the Vue
 * splash lives inside `App.vue` — so everything before mount paints an empty `#app`
 * unless the build injects a static splash into it. A boot that stalls in that window
 * leaves the user on a blank page with nothing reported.
 */

/**
 * Replaces the IndexedDB open the boot path starts with. `blocked` is what a browser
 * reports when another connection still holds the database; `silent` never answers at
 * all, which is the case no event can rescue.
 */
async function breakIndexedDbOpen(page: Page, mode: "blocked" | "silent") {
  await page.addInitScript((stubMode) => {
    Object.defineProperty(window.indexedDB, "open", {
      configurable: true,
      value: () => {
        const request: Record<string, unknown> = {};
        if (stubMode === "blocked") {
          setTimeout(() => {
            (request.onblocked as (() => void) | undefined)?.();
          }, 0);
        }
        return request;
      },
    });
  }, mode);
}

test.describe("App boot recovery", () => {
  test("serves the boot splash inside #app", async ({ page }) => {
    // Asserted against the raw HTML because the splash is injected by a string
    // replace on `<div id="app"></div>`, which no-ops silently if that markup
    // ever changes — leaving the pre-mount window blank again.
    const html = await (await page.request.get("/")).text();

    expect(html).toMatch(/<div id="app">\s*<div id="boot-splash"/);
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

  test("reports an error when the database open is blocked", async ({
    page,
  }) => {
    await breakIndexedDbOpen(page, "blocked");
    await page.goto("/");

    await expect(page.locator("#boot-splash .boot-splash-error")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-render-state",
      "error",
    );
  });

  test("reports an error when the database open never answers", async ({
    page,
  }) => {
    await breakIndexedDbOpen(page, "silent");
    await page.goto("/");

    // Bounded by the boot-path open timeout rather than waiting forever.
    await expect(page.locator("#boot-splash .boot-splash-error")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-render-state",
      "error",
    );
  });
});
