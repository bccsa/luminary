import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The prerendered output the `web` project asserts against. Defaults to the app's
 * `dist-web/`; `SSG_DIST_DIR` points it elsewhere when the build runs out of tree.
 */
export const SSG_DIST_DIR =
    process.env.SSG_DIST_DIR ?? path.resolve(__dirname, "../../app/dist-web");

/**
 * Seed-corpus expectations only hold against the local stack, whose data is the
 * checked-in `api/src/db/seedingDocs/`. A deployed environment gets the structural
 * assertions alone.
 */
export const SEEDED = !!process.env.E2E_COUCHDB_URL;

/** vite-ssg's flat `dirStyle`: `/explore` -> `explore.html`, `/` -> `index.html`. */
export function routeToFile(route: string): string {
    const withIndex = route.endsWith("/") ? `${route}index` : route;
    return `${withIndex.replace(/^\/+/, "")}.html`;
}

export function distPath(...segments: string[]): string {
    return path.join(SSG_DIST_DIR, ...segments);
}

export function distExists(...segments: string[]): boolean {
    return fs.existsSync(distPath(...segments));
}

export function readDist(...segments: string[]): string {
    return fs.readFileSync(distPath(...segments), "utf-8");
}

export function readDistJson<T>(...segments: string[]): T {
    return JSON.parse(readDist(...segments)) as T;
}

/** Route -> dependency keys, as written by `writeManifest` in `vite.config.web.ts`. */
export type SsgDeps = Record<string, string[]>;

export type SsgRedirectIndexEntry = { slug: string; status: number };

/** Sitemap `<loc>`s as route paths, so assertions don't depend on `VITE_WEB_ORIGIN`. */
export function sitemapRoutes(): string[] {
    const xml = readDist("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // An unset VITE_WEB_ORIGIN leaves the `<loc>` as a bare path rather than a URL.
    return locs.map((loc) => (loc.startsWith("/") ? loc : new URL(loc).pathname));
}

/** Every emitted `assets/*.js` chunk, for the "which entry did the client boot" checks. */
export function assetScripts(): string[] {
    const dir = distPath("assets");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
}

// ── Local-stack seed corpus ────────────────────────────────────────────────
// `api/src/db/seedingDocs/`: languages `en` (default) + `fr`, with every doc type
// present in both a public and a private group. The private half is what makes
// "the prerender never emits private content" a real assertion rather than a
// vacuous one.

export const SEED_DEFAULT_LANG_CODE = "en";
export const SEED_SECOND_LANG_CODE = "fr";

export const SEED_PUBLIC_SLUGS = [
    "blog1-eng",
    "blog1-fra",
    "page1-eng",
    "page1-fra",
    "topicA-eng",
    "topicA-fra",
    "category1-eng",
    "category1-fra",
    "privacy-policy",
    "politique-de-confidentialite",
    "copyright",
    "politique-de-copyright",
];

export const SEED_PRIVATE_SLUGS = [
    "blog2-eng",
    "blog2-fra",
    "page2-eng",
    "page2-fra",
    "topicB-eng",
    "topicB-fra",
    "category2-eng",
    "category2-fra",
];

/** `meta.prerender` routes in `app/src/router/routes.ts` — corpus-independent. */
export const STATIC_PRERENDER_ROUTES = ["/", "/explore", "/search", "/watch", "/404"];

/** Routes that are private or per-user, so they must never be prerendered. */
export const EXCLUDED_ROUTES = ["/open", "/settings", "/bookmarks"];

/** Locale-prefixed variants are emitted for every non-default language, minus `/404`. */
export const SEED_LOCALIZED_ROUTES = ["/fr", "/fr/explore", "/fr/search", "/fr/watch"];

/** `redirect-post1`: a permanent redirect, so a 301 with a canonical to the target. */
export const SEED_REDIRECT = {
    id: "redirect-post1",
    slug: "post1-eng",
    toSlug: "temp-post1-eng",
    status: 301,
};

/**
 * The watch feed filters on a `video` field, which no doc in `api/src/db/seedingDocs/`
 * sets — so it prerenders an empty feed.
 * TODO: flip to true once the seed corpus carries video content, which reactivates the
 * `/watch` assertion in `web/crawlability.spec.ts`.
 */
export const SEED_HAS_VIDEO = false;

/** A published article with body text, used for the JS-off and recovery assertions. */
export const SEED_ARTICLE = {
    slug: "blog1-eng",
    title: "Blog 1",
    summary: "This is an example blog",
    /** A distinctive phrase from the seeded body — not in the summary or the title. */
    bodyPhrase: "Willowdale",
    translation: { code: "fr", slug: "blog1-fra" },
};
