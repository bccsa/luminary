import { test, expect } from "@playwright/test";
import {
    SEEDED,
    SEED_ARTICLE,
    SEED_HAS_VIDEO,
    SEED_SECOND_LANG_CODE,
} from "../fixtures/ssgOutput";

// A crawler that runs no JavaScript is the whole reason the web tier exists, so
// these assert against the static HTML alone.
test.use({ javaScriptEnabled: false });

test.describe("Crawlable without JavaScript", () => {
    test.skip(!SEEDED, "Route-level expectations depend on the local stack's seed corpus.");

    test("renders an article's title and body", async ({ page }) => {
        await page.goto(`/${SEED_ARTICLE.slug}`, { waitUntil: "domcontentloaded" });

        await expect(
            page.getByRole("heading", { name: SEED_ARTICLE.title }).first(),
        ).toBeVisible();
        await expect(page.locator("[data-ssr-article-text]")).toContainText(
            SEED_ARTICLE.bodyPhrase,
        );
    });

    test("emits SEO metadata for an article", async ({ page }) => {
        await page.goto(`/${SEED_ARTICLE.slug}`, { waitUntil: "domcontentloaded" });

        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            "href",
            new RegExp(`/${SEED_ARTICLE.slug}$`),
        );
        await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
            "content",
            "article",
        );
        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
            "content",
            new RegExp(SEED_ARTICLE.title),
        );
        await expect(page.locator('script[type="application/ld+json"]')).not.toHaveCount(0);
    });

    test("links translations reciprocally via hreflang", async ({ page }) => {
        const { slug, translation } = SEED_ARTICLE;

        await page.goto(`/${slug}`, { waitUntil: "domcontentloaded" });
        await expect(
            page.locator(`link[rel="alternate"][hreflang="${translation.code}"]`),
        ).toHaveAttribute("href", new RegExp(`/${translation.slug}$`));
        // x-default points at the default-language translation, not the first alternate.
        await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
            "href",
            new RegExp(`/${slug}$`),
        );

        await page.goto(`/${translation.slug}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("lang", translation.code);
        await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
            "href",
            new RegExp(`/${slug}$`),
        );
    });

    test("renders the overview feeds", async ({ page }) => {
        for (const route of ["/", "/explore"]) {
            await page.goto(route, { waitUntil: "domcontentloaded" });
            await expect(page.getByRole("main")).toBeVisible();
            // The feed must carry real content, not an empty shell a crawler would index
            // as a blank page.
            await expect(page.getByRole("main").getByRole("link").first()).toBeVisible();
        }
    });

    test("renders the watch feed", async ({ page }) => {
        test.skip(!SEED_HAS_VIDEO, "The seed corpus carries no video content.");

        await page.goto("/watch", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("main").getByRole("link").first()).toBeVisible();
    });

    test("navigates through real anchors", async ({ page }) => {
        await page.goto(`/${SEED_ARTICLE.slug}`, { waitUntil: "domcontentloaded" });

        // Client-side routing is dead without JS, so the shell's nav has to be anchors.
        for (const href of ["/", "/explore", "/watch"]) {
            await expect(page.locator(`a[href="${href}"]`)).not.toHaveCount(0);
        }

        await page.locator('a[href="/explore"]').first().click();
        await expect(page).toHaveURL(/\/explore$/);
        await expect(page.getByRole("main")).toBeVisible();
    });

    test("renders locale-prefixed pages in their own language", async ({ page }) => {
        const code = SEED_SECOND_LANG_CODE;

        await page.goto(`/${code}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("lang", code);
        // UI strings come from the Language doc's translations; a prerender that skipped
        // i18n emits the raw `menu.*` keys instead.
        await expect(page.locator("body")).not.toContainText("menu.home");
        await expect(page.getByText("Accueil").first()).toBeVisible();
    });

    test("serves a prerendered 404 page", async ({ page }) => {
        await page.goto("/404", { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.locator("body")).not.toContainText("notfoundpage.");
    });
});
