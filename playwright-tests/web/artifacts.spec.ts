import { test, expect } from "@playwright/test";
import {
    EXCLUDED_ROUTES,
    SEEDED,
    SEED_LOCALIZED_ROUTES,
    SEED_PRIVATE_SLUGS,
    SEED_PUBLIC_SLUGS,
    SEED_REDIRECT,
    STATIC_PRERENDER_ROUTES,
    assetScripts,
    distExists,
    readDist,
    readDistJson,
    routeToFile,
    sitemapRoutes,
    type SsgDeps,
    type SsgRedirectIndexEntry,
} from "../fixtures/ssgOutput";

// Reading the build output needs no browser and no server, so these run as plain
// Node assertions.
test.describe("SSG build output", () => {
    test("emits the full artifact set", async () => {
        for (const file of [
            "index.html",
            "404.html",
            "sitemap.xml",
            "robots.txt",
            "llms.txt",
            "ssg-deps.json",
        ]) {
            expect(distExists(file), `${file} missing from the build output`).toBe(true);
        }
    });

    test("clears the build lock on finish", async () => {
        // `.ssg-building` is written at buildStart and removed in onFinished, so a
        // leftover lock means the build died before its sidecars were written.
        expect(distExists(".ssg-building")).toBe(false);
    });

    test("prerenders an HTML file for every sitemap URL", async () => {
        const routes = sitemapRoutes();
        expect(routes.length).toBeGreaterThan(0);

        const missing = routes.filter((route) => !distExists(routeToFile(route)));
        expect(missing, "sitemap lists routes with no prerendered file").toEqual([]);
    });

    test("records dependency keys for every prerendered route", async () => {
        const deps = readDistJson<SsgDeps>("ssg-deps.json");

        // Every route the sitemap advertises must be invalidatable, or an edit to its
        // data can never mark it stale.
        const unlisted = sitemapRoutes().filter((route) => !(route in deps));
        expect(unlisted, "sitemap routes absent from ssg-deps.json").toEqual([]);

        const orphaned = Object.keys(deps).filter((route) => !distExists(routeToFile(route)));
        expect(orphaned, "ssg-deps.json routes with no prerendered file").toEqual([]);
    });

    test("writes only well-formed dependency keys", async () => {
        const deps = readDistJson<SsgDeps>("ssg-deps.json");
        const allKeys = Object.values(deps).flat();
        expect(allKeys.length).toBeGreaterThan(0);

        // `facetKeys.ts` is the whole vocabulary; anything else in the manifest is a key
        // no invalidation will ever match.
        const malformed = [...new Set(allKeys)].filter(
            (key) => !key.startsWith("doc:") && !key.startsWith("facet:"),
        );
        expect(malformed).toEqual([]);
    });

    test("keeps the 404 page out of the sitemap", async () => {
        expect(distExists("404.html")).toBe(true);
        expect(sitemapRoutes()).not.toContain("/404");
    });

    test("ships no service worker", async () => {
        // The documented silent failure is the client-entry rewrite no-opping: the
        // prerender still uses main.web.ts while the client boots the full SPA, service
        // worker and all.
        expect(distExists("sw.js")).toBe(false);
        expect(distExists("registerSW.js")).toBe(false);

        const scripts = assetScripts();
        expect(scripts.length).toBeGreaterThan(0);
        expect(
            scripts.some((f) => f.startsWith("clientRuntime-")),
            "no clientRuntime chunk — the client entry is not main.web.ts",
        ).toBe(true);

        const withSwRegistration = scripts.filter((f) =>
            readDist("assets", f).includes("Matomo SW registration"),
        );
        expect(withSwRegistration, "an asset registers the analytics service worker").toEqual([]);
    });

    test("seeds the first-paint response cache into each page's head", async () => {
        const deps = readDistJson<SsgDeps>("ssg-deps.json");
        const dataRoutes = Object.entries(deps)
            .filter(([, keys]) => keys.length > 0)
            .map(([route]) => route);
        expect(dataRoutes.length).toBeGreaterThan(0);

        // A route that read data must carry the inline `hqcache:` seed; without it the
        // page hydrates from an empty cache and flashes.
        const unseeded = dataRoutes.filter(
            (route) => !readDist(routeToFile(route)).includes("hqcache:"),
        );
        expect(unseeded, "routes that read data but shipped no cache seed").toEqual([]);
    });
});

test.describe("SSG build output (seeded corpus)", () => {
    test.skip(!SEEDED, "Seed-corpus expectations only hold against the local stack.");

    test("prerenders every public slug", async () => {
        const routes = sitemapRoutes();

        for (const slug of SEED_PUBLIC_SLUGS) {
            expect(distExists(`${slug}.html`), `${slug}.html missing`).toBe(true);
            expect(routes).toContain(`/${slug}`);
        }
    });

    test("keys content pages by identity and by facet", async () => {
        const deps = readDistJson<SsgDeps>("ssg-deps.json");

        for (const slug of SEED_PUBLIC_SLUGS) {
            const keys = deps[`/${slug}`] ?? [];
            // Identity invalidates the page's own doc; facets invalidate it when a doc
            // joins or leaves one of the collections it renders.
            expect(keys.some((k) => k.startsWith("doc:")), `/${slug} has no doc: key`).toBe(true);
            expect(
                keys.some((k) => k.startsWith("facet:")),
                `/${slug} has no facet: key`,
            ).toBe(true);
        }
    });

    test("never prerenders private content", async () => {
        const routes = sitemapRoutes();
        const deps = readDistJson<SsgDeps>("ssg-deps.json");

        for (const slug of SEED_PRIVATE_SLUGS) {
            expect(distExists(`${slug}.html`), `${slug}.html was prerendered`).toBe(false);
            expect(routes).not.toContain(`/${slug}`);
            expect(deps).not.toHaveProperty(`/${slug}`);
        }
    });

    test("never prerenders per-user routes", async () => {
        for (const route of EXCLUDED_ROUTES) {
            expect(distExists(routeToFile(route)), `${route} was prerendered`).toBe(false);
            expect(sitemapRoutes()).not.toContain(route);
        }
    });

    test("prerenders the static and locale-prefixed route set", async () => {
        for (const route of [...STATIC_PRERENDER_ROUTES, ...SEED_LOCALIZED_ROUTES]) {
            expect(distExists(routeToFile(route)), `${route} missing`).toBe(true);
        }

        // The default language is served unprefixed; its prefixed variant exists as a
        // router route but is not part of the prerendered set.
        expect(sitemapRoutes()).not.toContain("/en");
    });

    test("emits a static redirect file and its serving-layer index", async () => {
        const html = readDist(`${SEED_REDIRECT.slug}.html`);
        expect(html).toContain(`content="${SEED_REDIRECT.status}"`);
        expect(html).toContain(`0;url=/${SEED_REDIRECT.toSlug}`);
        // Permanent redirects pass ranking on via canonical rather than noindex.
        expect(html).toContain(`<link rel="canonical" href="/${SEED_REDIRECT.toSlug}">`);

        const index = readDistJson<Record<string, SsgRedirectIndexEntry>>(
            "ssg-redirect-index.json",
        );
        expect(index[SEED_REDIRECT.id]).toEqual({
            slug: SEED_REDIRECT.slug,
            status: SEED_REDIRECT.status,
        });
    });
});
