import type { Page } from "@playwright/test";
import { appTest as test, expect } from "../../fixtures/test";

/**
 * The app mounts only after the database, sync and auth have initialised, so a boot that
 * stalls in that window leaves the user with nothing reported. These cover the recovery
 * paths — bounded database opens, and a language wait that gives up — through the boot
 * splash the build injects, so they need that splash deployed to run green.
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
