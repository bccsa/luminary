import { fileURLToPath, URL } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";
import type { ViteSSGOptions } from "vite-ssg";
import type { RouteRecordRaw } from "vue-router";
import vue from "@vitejs/plugin-vue";
import { buildTargetVirtuals } from "./vite-plugins/buildTargetVirtuals";

const env = loadEnv("", process.cwd());

// Dependency-capture collector — Node side. Shares the SAME `globalThis.__SSG_DEPS__`
// object the app bundle's `src/ssg/dependencyCapture.ts` reports into (vite-ssg runs
// the config and the SSR bundle in one process). Kept inline (not imported from
// src/) so the Node tsconfig project doesn't pull in app-project source files.
type SsgCapture = { current: Set<string>; manifest: Record<string, string[]> };
function capture(): SsgCapture {
    const g = globalThis as Record<string, unknown>;
    if (!g.__SSG_DEPS__) {
        g.__SSG_DEPS__ = { current: new Set<string>(), manifest: {} } as SsgCapture;
    }
    return g.__SSG_DEPS__ as SsgCapture;
}

// Response-cache serialization. The web client seeds its first paint synchronously
// from shared's response cache (localStorage `hqcache:*`, written by the content seam
// during the prerender via `writeResponseCache`). We serialize the entries a page
// produced into an inline classic <script> in its HTML; that script runs during parse
// — before the deferred ES-module entry boots the app — so `useHybridQuery({cache:true})`
// seeds synchronously with the prerendered docs (no snapshot store, no hydration flash).
const HQCACHE_PREFIX = "hqcache:";
// Minimal structural type — this Node-project config file has no DOM lib, so the
// global `Storage` type isn't available; the polyfill provides these members.
type SsgStorage = {
    length: number;
    key(i: number): string | null;
    getItem(k: string): string | null;
    removeItem(k: string): void;
};
function ssgLocalStorage(): SsgStorage | undefined {
    return (globalThis as { localStorage?: SsgStorage }).localStorage;
}
function readHqCache(): Record<string, string> {
    const ls = ssgLocalStorage();
    const out: Record<string, string> = {};
    if (!ls) return out;
    for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(HQCACHE_PREFIX)) out[k] = ls.getItem(k) ?? "";
    }
    return out;
}
function clearHqCache(): void {
    const ls = ssgLocalStorage();
    if (!ls) return;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(HQCACHE_PREFIX)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
}
function hqCacheScript(cache: Record<string, string>): string {
    // `<` escaping prevents a doc value containing `</script>` from closing the tag.
    const json = JSON.stringify(cache).replace(/</g, "\\u003c");
    return `<script>(function(c){try{for(var k in c)localStorage.setItem(k,c[k])}catch(e){}})(${json})</script>`;
}

const OUT_DIR = "dist-web";
const WEB_ORIGIN = (env.VITE_WEB_ORIGIN || "").replace(/\/$/, "");

// Scoped (incremental) rebuild mode: regenerate only the routes named in
// SSG_ONLY_ROUTES (comma-separated), preserving every other prerendered file.
// Driven by `npm run build:affected` (Phase 2 §3.5).
const SCOPED_ROUTES: string[] = (process.env.SSG_ONLY_ROUTES || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
const IS_SCOPED = SCOPED_ROUTES.length > 0;

const indexHtmlPath = () => join(process.cwd(), OUT_DIR, "index.html");
const manifestPath = () => join(process.cwd(), OUT_DIR, "ssg-deps.json");

// vite-ssg's client build always re-emits index.html (the SPA shell). On a scoped
// rebuild that does NOT include "/", that would clobber the prerendered home — so
// back it up now and restore it in onFinished (POC-proven gotcha, spec §3.5).
const preservedIndexHtml =
    IS_SCOPED && !SCOPED_ROUTES.includes("/") && existsSync(indexHtmlPath())
        ? readFileSync(indexHtmlPath(), "utf-8")
        : undefined;

// Write the route→keys dependency manifest. On a scoped rebuild, MERGE the newly
// captured routes into the existing manifest (don't drop untouched routes).
function writeManifest() {
    const fresh = capture().manifest;
    let merged: Record<string, string[]> = fresh;
    if (IS_SCOPED && existsSync(manifestPath())) {
        const existing = JSON.parse(readFileSync(manifestPath(), "utf-8")) as Record<string, string[]>;
        merged = { ...existing, ...fresh };
    }
    writeFileSync(manifestPath(), JSON.stringify(merged));
    console.log(
        `[ssg] wrote ssg-deps.json (${Object.keys(merged).length} routes` +
            `${IS_SCOPED ? `, merged ${Object.keys(fresh).length} regenerated` : ""})`,
    );
}

// Captured during route enumeration so onFinished can emit sitemap.xml/robots.txt.
let prerenderedRoutes: string[] = [];

function writeSeoArtifacts() {
    const urls = prerenderedRoutes
        .map((r) => `  <url><loc>${WEB_ORIGIN}${r}</loc></url>`)
        .join("\n");
    const sitemap =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    writeFileSync(join(process.cwd(), OUT_DIR, "sitemap.xml"), sitemap);

    const robots =
        `User-agent: *\nAllow: /\n` +
        (WEB_ORIGIN ? `\nSitemap: ${WEB_ORIGIN}/sitemap.xml\n` : "\n");
    writeFileSync(join(process.cwd(), OUT_DIR, "robots.txt"), robots);

    console.log(`[ssg] wrote sitemap.xml (${prerenderedRoutes.length} urls) + robots.txt`);
}

/**
 * Web / SSG build config. Separate from the native/default `vite.config.ts` so
 * the native SPA build (the future Capacitor base) stays byte-for-byte unchanged.
 *
 * Differences from the native config:
 *  - Renders via vite-ssg (prerender → static HTML + clean hydration).
 *  - Entry is `src/main.web.ts` (not `src/main.ts`).
 *  - NO service worker (VitePWA omitted) — the web tier is online-only by design.
 *  - Enumerates public routes from the API at build time.
 *
 * Run with: `npm run build:web` (sets VITE_BUILD_TARGET=web).
 */

// Rewrites the client entry in index.html from the native entry to the web/SSG
// entry, without touching index.html on disk (keeps the native build untouched).
//
// MUST run in the `pre` phase. Vite's build-html plugin applies `pre`
// transformIndexHtml hooks BEFORE it scans the HTML for its `<script
// type="module">` entry; the default (post) phase runs in `generateBundle`,
// by which point Vite has already (a) chosen `main.ts` as the Rollup entry and
// (b) replaced the script `src` with the hashed chunk path — so a post-phase
// `html.replace("/src/main.ts", …)` matches nothing and is a silent no-op. The
// result of getting this wrong: the prerender uses `main.web.ts` (correct) but
// the CLIENT boots `main.ts` — the full native app, with its service worker,
// Matomo analytics SW registration, and no vite-ssg snapshot hydration.
const rewriteWebEntry = (): Plugin => ({
    name: "ssg-web-entry",
    transformIndexHtml: {
        order: "pre",
        handler: (html) => html.replace("/src/main.ts", "/src/main.web.ts"),
    },
});

// Enumerate every public content slug from the unauthenticated /search endpoint.
// No Authorization header → anonymous default ("public") groups.
//
// Single request with a high limit (NOT offset pagination): CouchDB Mango offset
// pagination without a stable sort can miss/duplicate docs between pages, which
// made enumeration nondeterministic (a slug like "/sin" would intermittently drop
// out of the build AND the manifest). One request is deterministic for the current
// corpus size; if it ever truncates we log loudly.
async function fetchPublicSlugs(apiUrl: string): Promise<string[]> {
    const LIMIT = 10000;
    const query = { apiVersion: "0.0.0", types: ["post", "tag"], contentOnly: true, limit: LIMIT };
    const res = await fetch(`${apiUrl}/search`, {
        headers: { "X-Query": JSON.stringify(query) },
    });
    if (!res.ok) {
        throw new Error(`[ssg] route enumeration failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { docs?: Array<{ slug?: string; language?: string }> };
    const docs = data.docs ?? [];
    if (docs.length >= LIMIT) {
        console.warn(`[ssg] enumeration returned ${LIMIT} docs (limit) — slugs may be truncated; paginate with a stable sort.`);
    }
    // Build the route→language map so each page prerenders in its own language
    // (read by main.web.ts via globalThis). Same Node process as the SSR render.
    const routeLang: Record<string, string> = {};
    const slugs = new Set<string>();
    for (const d of docs) {
        if (!d.slug) continue;
        slugs.add(d.slug);
        if (d.language) routeLang[`/${d.slug}`] = d.language;
    }
    (globalThis as Record<string, unknown>).__SSG_ROUTE_LANG__ = routeLang;
    return [...slugs];
}

// The CMS default language id — the render language for non-content routes (home).
async function fetchDefaultLanguage(apiUrl: string): Promise<string> {
    const res = await fetch(`${apiUrl}/search`, {
        headers: { "X-Query": JSON.stringify({ apiVersion: "0.0.0", types: ["language"] }) },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { docs?: Array<{ _id?: string; default?: number }> };
    const langs = data.docs ?? [];
    return (langs.find((l) => l.default === 1) ?? langs[0])?._id ?? "";
}

const config: UserConfig & { ssgOptions: ViteSSGOptions } = {
    plugins: [buildTargetVirtuals(), vue(), rewriteWebEntry()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    define: {
        // Make hydration mismatches visible even in the production build, so
        // "no warnings" during validation is a real proof (Phase 1 §7).
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "true",
    },
    build: {
        // Separate output dir from the native build (`dist/`) so a native build's
        // service worker can never contaminate the web output (which must ship NO
        // service worker). The deploy repo uploads `dist-web/`.
        outDir: OUT_DIR,
        // Full build wipes the dir; a scoped rebuild MUST preserve untouched pages.
        emptyOutDir: !IS_SCOPED,
        target: "es2015",
        sourcemap: true,
        minify: env.VITE_BYPASS_MINIFY !== "true" && process.env.VITE_BYPASS_MINIFY !== "true",
        // NOTE: no manualChunks here — vite-ssg externalizes pinia/vue in the SSR
        // pass, and naming an external in manualChunks is a rollup error.
    },
    // Consumed by vite-ssg (see `ssgOptions` augmentation in vite-ssg types).
    ssgOptions: {
        entry: "src/main.web.ts",
        mock: true, // jsdom globals in Node so DOM-at-import code doesn't crash
        formatting: "minify",
        script: "async",
        // LOAD-BEARING: the dependency collector is a single shared object, so
        // pages MUST render one at a time or keys get mis-attributed (spec §3.2,
        // §7). Do not raise this without redesigning the collector.
        concurrency: 1,
        includedRoutes: async (_paths: string[], routes: readonly RouteRecordRaw[]) => {
            const apiUrl = env.VITE_API_URL;
            if (!apiUrl) {
                // Fail fast: a partial build that silently drops pages is worse
                // than no build (Phase 1 spec §3.1).
                throw new Error("[ssg] VITE_API_URL is required for route enumeration");
            }

            // Always populate the route→language map + default language (used per
            // route by main.web.ts to pick the render language) — including on a
            // scoped rebuild, which still needs the language for its routes.
            const slugs = await fetchPublicSlugs(apiUrl);
            (globalThis as Record<string, unknown>).__SSG_DEFAULT_LANG__ =
                await fetchDefaultLanguage(apiUrl);

            // Scoped rebuild: render only the named routes (map is now populated).
            if (IS_SCOPED) {
                console.log(`[ssg] scoped rebuild of ${SCOPED_ROUTES.length} route(s)`);
                return SCOPED_ROUTES;
            }

            // Private / per-user routes — never prerendered. The public "main" routes
            // (`/`, `/explore`, `/watch`) ARE prerendered via `meta.prerender` (they
            // render their tile collections through the SSG-aware useContentQuery seam).
            const exclude = new Set(["/open", "/settings", "/bookmarks"]);

            // Static public routes flagged for prerender (non-dynamic).
            const staticRoutes = routes
                .filter(
                    (r) =>
                        r.meta?.prerender &&
                        typeof r.path === "string" &&
                        !r.path.includes(":"),
                )
                .map((r) => r.path as string);

            const slugRoutes = slugs.map((s) => `/${s}`);

            const all = [...new Set([...staticRoutes, ...slugRoutes])].filter(
                (p) => !exclude.has(p),
            );
            console.log(
                `[ssg] prerendering ${all.length} routes ` +
                    `(${staticRoutes.length} static + ${slugRoutes.length} content)`,
            );
            prerenderedRoutes = all;
            return all;
        },
        // --- Render-time dependency capture (spec §3.2) + response-cache seed ---
        onBeforePageRender: () => {
            capture().current = new Set();
            // Per-page isolation: drop the previous page's cache so it can't leak into
            // this page's HTML (concurrency:1 makes this safe).
            clearHqCache();
            return undefined;
        },
        onPageRendered: (route, renderedHTML) => {
            const c = capture();
            c.manifest[route] = [...c.current].sort();

            // Inject the first-paint cache seed (no-op when the page primed nothing).
            const cache = readHqCache();
            if (!Object.keys(cache).length) return renderedHTML;
            const script = hqCacheScript(cache);
            return renderedHTML.includes("</head>")
                ? renderedHTML.replace("</head>", `${script}</head>`)
                : script + renderedHTML;
        },
        onFinished: () => {
            // Restore the prerendered home if this scoped rebuild didn't include it.
            if (preservedIndexHtml !== undefined) {
                writeFileSync(indexHtmlPath(), preservedIndexHtml);
                console.log("[ssg] restored prerendered index.html (/, not in scope)");
            }
            writeManifest();
            // Sitemap/robots reflect the full route set — only (re)write on a full build.
            if (!IS_SCOPED) writeSeoArtifacts();
        },
    },
};

export default defineConfig(config);
