import { appPersonaTest as test, expect } from "../../fixtures/persona";
import { waitForSynced } from "../../fixtures/readiness";

/**
 * Both posts are public, so a guest reaches them, and they share `tag-category1` /
 * `tag-topicA` — which is what puts one in the other's Read More section and gives
 * the client-side navigation below a real link to click.
 */
const FIRST = { slug: "blog1-eng", title: "Blog 1" };
const SECOND = { slug: "page1-eng", title: "Page 1" };

type RenderSample = { path: string; heading: string | null };

/**
 * Records the article heading against the URL on every DOM mutation, so a state
 * that is painted and replaced within a frame still leaves a trace. Polling from
 * the test process would step straight over a window this short.
 */
async function recordRenderedHeadings(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
        const scope = window as unknown as { __renderSamples?: RenderSample[] };
        type RenderSample = { path: string; heading: string | null };
        const samples: RenderSample[] = [];
        scope.__renderSamples = samples;

        const record = () => {
            const sample: RenderSample = {
                path: location.pathname,
                heading: document.querySelector("article h1")?.textContent?.trim() ?? null,
            };
            // Consecutive duplicates carry no information and would bury the
            // transition in thousands of identical rows.
            const last = samples[samples.length - 1];
            if (last && last.path === sample.path && last.heading === sample.heading) return;
            if (samples.length < 5000) samples.push(sample);
        };

        const start = () => {
            record();
            new MutationObserver(record).observe(document.body, {
                subtree: true,
                childList: true,
                characterData: true,
            });
        };

        if (document.body) start();
        else document.addEventListener("DOMContentLoaded", start, { once: true });
    });
}

async function readSamples(page: import("@playwright/test").Page): Promise<RenderSample[]> {
    return page.evaluate(
        () => (window as unknown as { __renderSamples?: RenderSample[] }).__renderSamples ?? [],
    );
}

test.describe("App post-to-post navigation", () => {
    test.beforeEach(async ({ page }) => {
        await recordRenderedHeadings(page);
    });

    test("does not render the previous post after following a link to another one", async ({
        page,
    }) => {
        await page.goto(`/${FIRST.slug}`);
        await waitForSynced(page, { types: ["content"] });
        await expect(page.locator("article h1").first()).toHaveText(FIRST.title);

        // A Read More card is a RouterLink, so this is a client-side param change
        // on the same route — the component is reused rather than re-created,
        // which is the condition the stale render needs.
        const link = page.locator(`a[href="/${SECOND.slug}"]`).first();
        await link.scrollIntoViewIfNeeded();
        await link.click();

        await expect(page).toHaveURL(new RegExp(`/${SECOND.slug}$`));
        await expect(page.locator("article h1").first()).toHaveText(SECOND.title);

        const samples = await readSamples(page);

        // Assert the positive first: an empty or heading-less trace would satisfy
        // the absence check below on its own and prove nothing.
        expect(
            samples.some((s) => s.path === `/${SECOND.slug}` && s.heading === SECOND.title),
            `Never observed "${SECOND.title}" rendered at /${SECOND.slug}. Saw: ${JSON.stringify(samples)}`,
        ).toBe(true);

        const stale = samples.filter(
            (s) => s.path === `/${SECOND.slug}` && s.heading === FIRST.title,
        );
        expect(
            stale,
            `The previous post was rendered at /${SECOND.slug}. Trace: ${JSON.stringify(samples)}`,
        ).toEqual([]);
    });

    test("does not render the previously opened post when another is opened cold", async ({
        page,
    }) => {
        // The response cache is keyed on query SHAPE, not values, and the SPA build
        // passes no per-slug discriminator — so one entry is shared by every post
        // page and seeds the next one's first paint.
        await page.goto(`/${FIRST.slug}`);
        await waitForSynced(page, { types: ["content"] });
        await expect(page.locator("article h1").first()).toHaveText(FIRST.title);

        await page.goto(`/${SECOND.slug}`);
        await expect(page.locator("article h1").first()).toHaveText(SECOND.title);

        const samples = await readSamples(page);

        expect(
            samples.some((s) => s.path === `/${SECOND.slug}` && s.heading === SECOND.title),
            `Never observed "${SECOND.title}" rendered at /${SECOND.slug}. Saw: ${JSON.stringify(samples)}`,
        ).toBe(true);

        const stale = samples.filter(
            (s) => s.path === `/${SECOND.slug}` && s.heading === FIRST.title,
        );
        expect(
            stale,
            `A cached window from /${FIRST.slug} was painted at /${SECOND.slug}. Trace: ${JSON.stringify(samples)}`,
        ).toEqual([]);
    });
});
