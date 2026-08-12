import { fileURLToPath, URL } from "node:url";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";
import type { ViteSSGOptions } from "vite-ssg";
import type { RouteRecordRaw } from "vue-router";
import vue from "@vitejs/plugin-vue";
import { buildTargetVirtuals } from "./vite-plugins/buildTargetVirtuals";
import { buildDeleteQueue } from "./src/ssg/deleteQueue";
import {
    drainQuery,
    enumerateDeleteCmds,
    enumeratePublicContent,
    isRouteEligible,
    type KeysetDocument,
    type KeysetQuery,
    type QueryTransport,
} from "./src/ssg/queryDrain";
import {
    ACTIVE_PROVIDER_KEY,
    LEGACY_AUTH0_CACHE_PREFIX,
    OIDC_USER_PREFIX,
} from "./src/authStorage";
import { releaseSsrChain } from "./src/ssg/ssrChains";
import { takeRenderIssues, type RenderIssue } from "./src/ssg/renderDiagnostics";
import { setSessionNow } from "./src/util/sessionNow";
import {
    DocType,
    RedirectType,
    type DeleteReason,
    type ContentDto,
    type DocLike,
    docFacetShard,
    docFacetShardFile,
    docFacetsIndex,
    redirectFile,
    redirectHtml,
    buildRedirectIndex,
    type SsgRedirectIndex,
    buildRouteIndex,
    emptyRouteIndex,
    type SsgRouteIndex,
    routeIndexShard,
    routeIndexShardFile,
    routeIndexShardsIndex,
} from "luminary-shared";

const env = loadEnv("", process.cwd());

// Dependency-capture collector — Node side. Shares the SAME `globalThis.__SSG_DEPS__`
// object the app bundle's `src/ssg/dependencyCapture.ts` reports into (vite-ssg runs
// the config and the SSR bundle in one process). Kept inline (not imported from
// src/) so the Node tsconfig project doesn't pull in app-project source files.
// Everything is keyed by route so pages can render concurrently: vite-ssg interleaves
// renders, and a shared accumulator would attribute one page's keys (or cache entries) to
// whichever page finished next. That failure is silent — the manifest just gains wrong
// route→key mappings, and those pages then never regenerate when their data changes.
type SsgCapture = {
    manifest: Record<string, Set<string>>;
    cache: Record<string, Record<string, string>>;
};
function capture(): SsgCapture {
    const g = globalThis as Record<string, unknown>;
    if (!g.__SSG_DEPS__) {
        g.__SSG_DEPS__ = { manifest: {}, cache: {} } as SsgCapture;
    }
    return g.__SSG_DEPS__ as SsgCapture;
}

// Created eagerly, before any page renders. `reportKeys` no-ops when this object is absent —
// that is what keeps the call site harmless on the client — so if the first render is also
// what creates it, that page silently records no dependency keys and is never invalidated by
// ISR. There is no per-page hook to do it in: the collector is keyed by route precisely so
// that pages can render concurrently without one.
capture();

// Render-diagnostics collector — Node side. Shares the SAME `globalThis.__SSG_RENDER_ISSUES__`
// array the app bundle's `src/ssg/renderDiagnostics.ts` reports into (vite-ssg runs the config
// and the SSR bundle in one process). Created eagerly, before any page renders, so
// `reportRenderIssue` has a buffer to push into from the very first render — without it the
// reporter no-ops and query failures stay silent.
function renderIssuesBuffer(): RenderIssue[] {
    const g = globalThis as Record<string, unknown>;
    if (!g.__SSG_RENDER_ISSUES__) {
        g.__SSG_RENDER_ISSUES__ = [] as RenderIssue[];
    }
    return g.__SSG_RENDER_ISSUES__ as RenderIssue[];
}
renderIssuesBuffer();

// Response-cache serialization. We inline a page's `hqcache:*` entries as a classic <script> that runs during parse, before the ES-module entry boots, so `useHybridQuery({cache:true})` seeds synchronously with the prerendered docs (no hydration flash). The entries are recorded per route as they're written (see `src/ssg/dependencyCapture.ts`) rather than scraped back out of the shared store, which concurrent renders share.
function hqCacheScript(cache: Record<string, string>): string {
    // `<` escaping prevents a doc value containing `</script>` from closing the tag.
    const json = JSON.stringify(cache).replace(/</g, "\\u003c");
    // The catch surfaces a failed seed write (e.g. QuotaExceededError / a sandboxed
    // SecurityError) so a missing-seed hydration flash is diagnosable instead of
    // silent — the client's cold-start backfill covers it, but the warning points
    // at the storage-level root cause.
    return `<script>(function(c){try{for(var k in c)localStorage.setItem(k,c[k])}catch(e){console.warn('[hqcache] seed write failed:',e&&e.name,e&&e.message)}})(${json})</script>`;
}

// Pre-paint auth gate. The prerendered HTML is the public/anonymous view, which a returning logged-in user would briefly see before the JS boots; this hides `#app` via CSS until Vue's auth-scoped first render lands. Only engages when a persisted session looks present (mirrors `hasPersistedSession()`); revealed by App.vue's onMounted.
const AUTH_GATE_CLASS = "ssg-auth-pending";
function authGateScript(): string {
    const oidcUserPrefix = JSON.stringify(OIDC_USER_PREFIX);
    const legacyAuth0Prefix = JSON.stringify(LEGACY_AUTH0_CACHE_PREFIX);
    const activeProviderKey = JSON.stringify(ACTIVE_PROVIDER_KEY);
    return (
        `<style>html.${AUTH_GATE_CLASS} #app{visibility:hidden}</style>` +
        `<script>(function(){try{` +
        `var h=false;` +
        `for(var i=0;i<localStorage.length;i++){` +
        `var k=localStorage.key(i);` +
        `if(k&&(k.indexOf(${oidcUserPrefix})===0||k.indexOf(${legacyAuth0Prefix})===0)){h=true;break}` +
        `}` +
        `if(!h)h=!!localStorage.getItem(${activeProviderKey});` +
        `if(h){document.documentElement.classList.add("${AUTH_GATE_CLASS}");` +
        `setTimeout(function(){document.documentElement.classList.remove("${AUTH_GATE_CLASS}")},3000)}` +
        `}catch(e){}})();</script>`
    );
}

// Mirrors main.web.ts's `ssgRouteLang`: a locale-prefixed route takes its language from the
// prefix, a slug route from the route→language map built during enumeration, anything else
// the default.
function expectedLangForRoute(route: string): string {
    const g = globalThis as Record<string, unknown>;
    const codeToId = g.__SSG_LANG_CODE_TO_ID__ as Record<string, string> | undefined;
    const routeLang = g.__SSG_ROUTE_LANG__ as Record<string, string> | undefined;
    const firstSegment = route.split("/").filter(Boolean)[0];
    if (firstSegment && codeToId?.[firstSegment]) return codeToId[firstSegment];
    return routeLang?.[route] || (g.__SSG_DEFAULT_LANG__ as string) || "";
}

/**
 * Fails the build when a page's dependency keys are tagged with a language it did not render
 * in. Every `facet:` key a page records is suffixed with that page's render language, so a
 * mismatch means per-render state leaked across concurrent renders — which would also mean the
 * page fetched another language's content. Both failures are otherwise silent: the HTML looks
 * structurally fine, and the damage only surfaces later as pages that never regenerate.
 *
 * Same-language bleed is not detectable this way (the suffixes match), so this is a canary for
 * raising `SSG_CONCURRENCY`, not a proof of isolation — pair it with the byte-identical
 * `ssg-deps.json` comparison.
 */
function assertRouteLanguage(route: string, keys: Set<string> | undefined): void {
    const expected = expectedLangForRoute(route);
    if (!expected || !keys?.size) return;
    // endsWith rather than splitting: a facet *value* may itself contain a colon.
    const wrong = [...keys].filter(
        (key) => key.startsWith("facet:") && !key.endsWith(`:${expected}`),
    );
    if (!wrong.length) return;
    const shown = wrong.slice(0, 5).join(", ");
    throw new Error(
        `[ssg] ${route} recorded dependency keys for a language it did not render in ` +
            `(expected suffix ":${expected}"). Per-render state leaked between concurrent ` +
            `renders, so this page's content is likely wrong too. Offending keys: ${shown}` +
            (wrong.length > 5 ? ` (+${wrong.length - 5} more)` : "") +
            `\nRe-run with SSG_CONCURRENCY=1; if that passes, the parallel path has a shared global.`,
    );
}

const OUT_DIR = "dist-web";
const WEB_ORIGIN = (env.VITE_WEB_ORIGIN || "").replace(/\/$/, "");
const APP_NAME = env.VITE_APP_NAME || "Luminary";
type SsgLanguage = KeysetDocument & { languageCode?: string; default?: number };
type SsgRedirect = KeysetDocument & {
    slug?: string;
    toSlug?: string;
    deleteReq?: number;
    redirectType?: RedirectType;
};
type SsgContent = Partial<DocLike> & KeysetDocument & { slug?: string; publishDate?: number };
type SsgDeleteCmdDoc = KeysetDocument & {
    docId?: string;
    slug?: string;
    deleteReason?: DeleteReason;
    language?: string;
    memberOf?: string[];
    newMemberOf?: string[];
};

// Scoped (incremental) rebuild mode: regenerate only the routes in `SSG_ONLY_ROUTES` (comma-separated), preserving every other prerendered file. Driven by `SSG_ONLY_ROUTES=... npm run build:web`.
const SCOPED_ROUTES: string[] = (process.env.SSG_ONLY_ROUTES || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
const IS_SCOPED = SCOPED_ROUTES.length > 0;

// DeleteCmd ids relevant to this scoped rebuild (comma-separated), passed via `SSG_DELETE_CMD_IDS`. A deleted route was never rendered this build, so the deploy repo passes the triggering ids explicitly for the delete-queue merge.
const SCOPED_DELETE_CMD_IDS: string[] = (process.env.SSG_DELETE_CMD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

const indexHtmlPath = () => join(process.cwd(), OUT_DIR, "index.html");
const manifestPath = () => join(process.cwd(), OUT_DIR, "ssg-deps.json");
const redirectIndexPath = () => join(process.cwd(), OUT_DIR, "ssg-redirect-index.json");
// Sharded (not one growing file) — see docFacetShards.ts / routeIndexShards.ts for why
// and writeDocFacets() / writeRouteIndex() below for how a scoped rebuild only touches
// the shards its docs land in.
const docFacetsDir = () => join(process.cwd(), OUT_DIR, "ssg-doc-facets");
const docFacetsIndexPath = () => join(docFacetsDir(), "index.json");
const docFacetShardPath = (shard: string) => join(docFacetsDir(), docFacetShardFile(shard));
const routeIndexDir = () => join(process.cwd(), OUT_DIR, "ssg-route-index");
const routeIndexIndexPath = () => join(routeIndexDir(), "index.json");
const routeIndexShardPath = (shard: string) => join(routeIndexDir(), routeIndexShardFile(shard));
// Flat, not sharded (unlike ssg-route-index/ssg-doc-facets): this sidecar never
// leaves the server (see deleteQueue.ts's own doc comment), so one file per DeleteCmd
// id is simpler than bucketing — "processed" is a plain rm of that one file.
const deleteQueueDir = () => join(process.cwd(), OUT_DIR, "ssg-delete-queue");
const deleteQueueEntryPath = (id: string) => join(deleteQueueDir(), `${id}.json`);

// Build-in-progress lock, consumed by the deployment repo's ISR watcher: it must
// not spawn a scoped rebuild while a build (the initial full `build:web`, or its own
// scoped build) is writing `dist-web`. Written at build start, removed on finish.
const lockPath = () => join(process.cwd(), OUT_DIR, ".ssg-building");
const ssgBuildLock = (): Plugin => ({
    name: "ssg-build-lock",
    buildStart() {
        mkdirSync(join(process.cwd(), OUT_DIR), { recursive: true });
        writeFileSync(lockPath(), String(Date.now()));
    },
});

// vite-ssg's client build always re-emits index.html. On a scoped rebuild that excludes "/", that would clobber the prerendered home, so back it up and restore it in onFinished.
const preservedIndexHtml =
    IS_SCOPED && !SCOPED_ROUTES.includes("/") && existsSync(indexHtmlPath())
        ? readFileSync(indexHtmlPath(), "utf-8")
        : undefined;

function mergeScoped<T>(path: string, fresh: Record<string, T>): Record<string, T> {
    if (!IS_SCOPED || !existsSync(path)) return fresh;
    const existing = JSON.parse(readFileSync(path, "utf-8")) as Record<string, T>;
    return { ...existing, ...fresh };
}

// Write the route→keys dependency manifest. On a scoped rebuild, MERGE the newly
// captured routes into the existing manifest (don't drop untouched routes). Keys are sorted
// so the file is byte-stable regardless of the order concurrent renders reported them in.
function writeManifest() {
    const fresh = Object.fromEntries(
        Object.entries(capture().manifest).map(([route, keys]) => [route, [...keys].sort()]),
    );
    // Sort routes as well as keys: above concurrency 1 pages finish in a nondeterministic
    // order, so insertion order alone would make the file differ byte-for-byte between
    // identical builds. Sorting is what lets a concurrency>1 build be diffed against a
    // concurrency:1 one to prove no per-render state leaked.
    const merged = Object.fromEntries(
        Object.entries(mergeScoped(manifestPath(), fresh)).sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(manifestPath(), JSON.stringify(merged));
    console.log(
        `[ssg] wrote ssg-deps.json (${Object.keys(merged).length} routes` +
            `${IS_SCOPED ? `, merged ${Object.keys(fresh).length} regenerated` : ""})`,
    );
}

// Captured during route enumeration so onFinished can emit sitemap.xml/robots.txt.
let prerenderedRoutes: string[] = [];
let routeIndex: SsgRouteIndex = { content: {}, parent: {} };
let docFacets: Record<string, DocLike> = {};
// Doc id -> its route, captured alongside docFacets so writeDocFacets can tell which
// entries belong to THIS build's rendered route set (see includedRoutes/renderedRouteSet).
let docFacetRoutes: Record<string, string> = {};
// The routes actually rendered THIS invocation (SCOPED_ROUTES on a scoped rebuild,
// otherwise the full site) — narrower than `prerenderedRoutes`, which always reflects
// the full site (sitemap needs that regardless of scope).
let renderedRouteSet: Set<string> = new Set();
let routeLastmod: Record<string, string> = {};

function writeSeoArtifacts() {
    const urls = prerenderedRoutes
        .filter((r) => r !== "/404") // error page is not a crawlable URL
        .map(
            (r) =>
                `  <url><loc>${WEB_ORIGIN}${r}</loc>` +
                (routeLastmod[r] ? `<lastmod>${routeLastmod[r]}</lastmod>` : "") +
                `</url>`,
        )
        .join("\n");
    const sitemap =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    writeFileSync(join(process.cwd(), OUT_DIR, "sitemap.xml"), sitemap);

    const robots =
        `User-agent: *\nAllow: /\n\n` +
        `User-agent: GPTBot\nAllow: /\n\n` +
        `User-agent: ClaudeBot\nAllow: /\n\n` +
        `User-agent: PerplexityBot\nAllow: /\n\n` +
        `User-agent: Google-Extended\nAllow: /\n` +
        (WEB_ORIGIN ? `\nSitemap: ${WEB_ORIGIN}/sitemap.xml\n` : "\n");
    writeFileSync(join(process.cwd(), OUT_DIR, "robots.txt"), robots);

    // Keep a compact, crawlable entry point for LLM-based clients alongside the
    // standard crawler artifacts. Individual documents remain discoverable via
    // the sitemap, which is kept current by the ISR rebuild pipeline.
    const llms =
        `# ${APP_NAME}\n\n` +
        `> Public content from ${APP_NAME}.\n\n` +
        `## Key pages\n\n` +
        `- [Home](${WEB_ORIGIN}/): Latest public content.\n` +
        `- [Explore](${WEB_ORIGIN}/explore): Browse public topics and content.\n` +
        `- [Watch](${WEB_ORIGIN}/watch): Browse public video content.\n\n` +
        `## Discovery\n\n` +
        `- [Sitemap](${WEB_ORIGIN}/sitemap.xml): Canonical URLs for all public content.\n`;
    writeFileSync(join(process.cwd(), OUT_DIR, "llms.txt"), llms);

    console.log(
        `[ssg] wrote sitemap.xml (${prerenderedRoutes.length} urls) + robots.txt + llms.txt`,
    );
}

// Sharded like writeDocFacets() below: only content ids / parent ids whose route was
// actually rendered THIS build get their shard touched, so a scoped rebuild reads/writes
// a handful of small shard files, not one ssg-route-index.json that grows without bound
// as the site grows (see routeIndex.ts / routeIndexShards.ts).
function writeRouteIndex() {
    mkdirSync(routeIndexDir(), { recursive: true });
    writeFileSync(routeIndexIndexPath(), JSON.stringify(routeIndexShardsIndex()));

    const byShard = new Map<string, SsgRouteIndex>();
    const shardFor = (shard: string) =>
        byShard.get(shard) ?? byShard.set(shard, emptyRouteIndex()).get(shard)!;

    for (const [id, entry] of Object.entries(routeIndex.content)) {
        if (!renderedRouteSet.has(entry.route)) continue;
        shardFor(routeIndexShard(id)).content[id] = entry;
    }
    for (const [parentId, routes] of Object.entries(routeIndex.parent)) {
        if (!routes.some((route) => renderedRouteSet.has(route))) continue;
        shardFor(routeIndexShard(parentId)).parent[parentId] = routes;
    }

    let written = 0;
    for (const [shard, fresh] of byShard) {
        const path = routeIndexShardPath(shard);
        const existing = existsSync(path)
            ? (JSON.parse(readFileSync(path, "utf-8")) as SsgRouteIndex)
            : emptyRouteIndex();
        writeFileSync(
            path,
            JSON.stringify({
                content: { ...existing.content, ...fresh.content },
                parent: { ...existing.parent, ...fresh.parent },
            } as SsgRouteIndex),
        );
        written += Object.keys(fresh.content).length;
    }
    console.log(
        `[ssg] wrote ssg-route-index/ (${written} doc(s) across ${byShard.size} shard(s), ` +
            `${routeIndexShardsIndex().shardCount} total)`,
    );
}

// Only docs whose route was rendered this build get their shard touched, so a scoped rebuild reads/writes a handful of small shard files instead of the whole site's facet snapshot (see docFacetShards.ts).
function writeDocFacets() {
    mkdirSync(docFacetsDir(), { recursive: true });
    writeFileSync(docFacetsIndexPath(), JSON.stringify(docFacetsIndex()));

    const byShard = new Map<string, Record<string, DocLike>>();
    for (const [id, snapshot] of Object.entries(docFacets)) {
        const route = docFacetRoutes[id];
        if (!route || !renderedRouteSet.has(route)) continue;
        const shard = docFacetShard(id);
        (byShard.get(shard) ?? byShard.set(shard, {}).get(shard)!)[id] = snapshot;
    }

    let written = 0;
    for (const [shard, fresh] of byShard) {
        const path = docFacetShardPath(shard);
        const existing = existsSync(path)
            ? (JSON.parse(readFileSync(path, "utf-8")) as Record<string, DocLike>)
            : {};
        writeFileSync(path, JSON.stringify({ ...existing, ...fresh }));
        written += Object.keys(fresh).length;
    }
    console.log(
        `[ssg] wrote ssg-doc-facets/ (${written} doc(s) across ${byShard.size} shard(s), ` +
            `${docFacetsIndex().shardCount} total)`,
    );
}

function docFacetSnapshot(doc: SsgContent): DocLike | undefined {
    if (!doc._id) return undefined;
    return {
        _id: doc._id,
        parentId: doc.parentId ?? doc._id,
        parentTags: doc.parentTags ?? [],
        parentPinned: doc.parentPinned,
        language: doc.language ?? "",
    };
}

function localizedStaticPaths(staticRoutes: string[], langCodes: string[], defaultCode: string) {
    return [...new Set(langCodes)]
        .filter((code) => code && code !== defaultCode)
        .flatMap((code) =>
            staticRoutes.map((route) => (route === "/" ? `/${code}` : `/${code}${route}`)),
        );
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

// Rewrite the client entry in index.html from `main.ts` to `main.web.ts` without touching index.html on disk. MUST run in the `pre` phase so it applies before Vite scans for the module entry and rewrites the script src.
const rewriteWebEntry = (): Plugin => ({
    name: "ssg-web-entry",
    transformIndexHtml: {
        order: "pre",
        handler: (html) => html.replace("/src/main.ts", "/src/main.web.ts"),
    },
});

function queryTransport(apiUrl: string, operation: string): QueryTransport {
    return async <T extends KeysetDocument>(query: KeysetQuery): Promise<T[]> => {
        const res = await fetch(`${apiUrl}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(query),
        });
        if (!res.ok) {
            throw new Error(`[ssg] ${operation} failed: ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as { docs?: T[] };
        return data.docs ?? [];
    };
}

// Enumerate every public content slug through anonymous /query access. Each
// type-specific stream uses a stable (updatedTimeUtc, _id) keyset cursor.
async function fetchPublicSlugs(apiUrl: string, now: number): Promise<string[]> {
    // Drain the full published set, including scheduled "coming soon" docs. The corpus
    // (published below) feeds the per-page local query resolver, which serves feed
    // queries that intentionally match coming-soon tiles, so those docs must be present.
    const docs = await enumeratePublicContent<SsgContent>(
        queryTransport(apiUrl, "route enumeration"),
    );
    // Slug routes are gated to `publishDate <= now` via `isRouteEligible`: a coming-soon
    // doc gets a feed tile (it's in the corpus) but no page, since it isn't readable yet.
    const routeEligible = (d: SsgContent) => isRouteEligible(d, now);
    // Build the route→language map so each page prerenders in its own language
    // (read by main.web.ts via globalThis). Same Node process as the SSR render.
    const routeLang: Record<string, string> = {};
    const slugs = new Set<string>();
    routeIndex = buildRouteIndex(docs.filter(routeEligible));
    docFacets = {};
    docFacetRoutes = {};
    routeLastmod = {};
    for (const d of docs) {
        if (!routeEligible(d)) continue;
        const snapshot = docFacetSnapshot(d);
        if (snapshot && d.slug) {
            docFacets[snapshot._id] = snapshot;
            docFacetRoutes[snapshot._id] = `/${d.slug}`;
        }
        if (!d.slug) continue;
        slugs.add(d.slug);
        if (typeof d.updatedTimeUtc === "number") {
            routeLastmod[`/${d.slug}`] = new Date(d.updatedTimeUtc).toISOString();
        }
        if (d.language) routeLang[`/${d.slug}`] = d.language;
    }
    (globalThis as Record<string, unknown>).__SSG_ROUTE_LANG__ = routeLang;
    // Publish the full drained corpus (incl. coming-soon) for the SSR branch's local
    // query resolver (src/ssg/contentStore.ts). Read on `globalThis` because the config
    // and the Vite-SSG app bundle are separate module realms. Feed queries read this
    // locally, so a tile can only ever reference a doc that was published at drain time —
    // never one the live API would surface mid-build without a prerendered slug page.
    (globalThis as Record<string, unknown>).__SSG_CONTENT_CORPUS__ =
        docs as unknown as ContentDto[];
    return [...slugs];
}

async function fetchLanguages(apiUrl: string): Promise<SsgLanguage[]> {
    return drainQuery<SsgLanguage>(queryTransport(apiUrl, "language enumeration"), {
        type: "language",
    });
}

async function fetchRedirects(apiUrl: string): Promise<SsgRedirect[]> {
    return drainQuery<SsgRedirect>(queryTransport(apiUrl, "redirect enumeration"), {
        type: "redirect",
    });
}

// Drain this build's relevant DeleteCmd docs. A Content-translation delete's DeleteCmd carries the parent's docType (Post/Tag), and /query requires docType as a scalar, so it's three drains. On a scoped rebuild with no delete-cmd ids given, skip the network calls.
async function fetchDeleteCmds(
    apiUrl: string,
): Promise<{ contentCmds: SsgDeleteCmdDoc[]; redirectCmds: SsgDeleteCmdDoc[] }> {
    if (IS_SCOPED && SCOPED_DELETE_CMD_IDS.length === 0) {
        return { contentCmds: [], redirectCmds: [] };
    }
    const ids = IS_SCOPED ? SCOPED_DELETE_CMD_IDS : undefined;
    const transport = queryTransport(apiUrl, "delete-cmd enumeration");
    const [posts, tags, redirects] = await Promise.all([
        enumerateDeleteCmds<SsgDeleteCmdDoc>(transport, DocType.Post, ids),
        enumerateDeleteCmds<SsgDeleteCmdDoc>(transport, DocType.Tag, ids),
        enumerateDeleteCmds<SsgDeleteCmdDoc>(transport, DocType.Redirect, ids),
    ]);
    return { contentCmds: [...posts, ...tags], redirectCmds: redirects };
}

// Resolve this build's drained DeleteCmds into the pending-delete queue, writing one file per entry into `ssg-delete-queue/` (flat, not sharded). Legacy (slug-less) fallback data is loaded lazily — only the shards a legacy cmd's docId hashes to, and the redirect index if a legacy Redirect cmd needs it.
function writeDeleteQueue(cmds: {
    contentCmds: SsgDeleteCmdDoc[];
    redirectCmds: SsgDeleteCmdDoc[];
}) {
    const { contentCmds, redirectCmds } = cmds;
    if (!contentCmds.length && !redirectCmds.length) {
        console.log("[ssg] no delete-cmd entries to add to ssg-delete-queue/ this run");
        return;
    }

    let legacyRouteIndex: SsgRouteIndex | undefined;
    const legacyContentCmds = contentCmds.filter((c) => !c.slug && c.docId);
    if (legacyContentCmds.length) {
        legacyRouteIndex = emptyRouteIndex();
        const shards = new Set(legacyContentCmds.map((c) => routeIndexShard(c.docId!)));
        for (const shard of shards) {
            const path = routeIndexShardPath(shard);
            if (!existsSync(path)) continue;
            const shardIndex = JSON.parse(readFileSync(path, "utf-8")) as SsgRouteIndex;
            Object.assign(legacyRouteIndex.content, shardIndex.content);
            Object.assign(legacyRouteIndex.parent, shardIndex.parent);
        }
    }

    let legacyRedirectSlugs: Record<string, string> | undefined;
    if (redirectCmds.some((c) => !c.slug) && existsSync(redirectIndexPath())) {
        const index = JSON.parse(readFileSync(redirectIndexPath(), "utf-8")) as SsgRedirectIndex;
        legacyRedirectSlugs = Object.fromEntries(
            Object.entries(index).map(([id, entry]) => [id, entry.slug]),
        );
    }

    const fresh = buildDeleteQueue(
        contentCmds,
        redirectCmds,
        legacyRouteIndex,
        legacyRedirectSlugs,
    );

    mkdirSync(deleteQueueDir(), { recursive: true });
    for (const [id, entry] of Object.entries(fresh)) {
        writeFileSync(deleteQueueEntryPath(id), JSON.stringify(entry));
    }
    console.log(
        `[ssg] wrote ${Object.keys(fresh).length} entr${Object.keys(fresh).length === 1 ? "y" : "ies"} to ssg-delete-queue/`,
    );
}

async function writeRedirectFiles(apiUrl: string): Promise<void> {
    const redirects = await fetchRedirects(apiUrl);
    writeFileSync(redirectIndexPath(), JSON.stringify(buildRedirectIndex(redirects)));
    let written = 0;
    for (const redirect of redirects) {
        if (!redirect.slug || !redirect.toSlug || redirect.deleteReq) continue;
        const file = join(process.cwd(), OUT_DIR, redirectFile(redirect.slug));
        if (existsSync(file)) continue; // prerendered content/static route wins
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(
            file,
            redirectHtml(redirect.toSlug, redirect.redirectType ?? RedirectType.Temporary),
        );
        written++;
    }
    console.log(`[ssg] wrote ${written} static redirect file(s)`);
}

const config: UserConfig & { ssgOptions: ViteSSGOptions } = {
    plugins: [ssgBuildLock(), buildTargetVirtuals(), vue(), rewriteWebEntry()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // Consume luminary-shared straight from source, same as the native config, so a
            // shared edit doesn't need a rebuild for this target to see it.
            "luminary-shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
        },
        // shared/src imports these; a second copy of vue or dexie breaks reactivity, and on
        // this target it surfaces as a hydration mismatch rather than an outright error.
        dedupe: ["vue", "dexie", "@vueuse/core"],
    },
    define: {
        // Make hydration mismatches visible even in the production build so "no warnings" is a real signal.
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
        // Every piece of per-render state is now keyed by route — the dependency keys and the
        // `hqcache:*` seed (`src/ssg/dependencyCapture.ts`) and the prefetch ordering chain
        // (`useContentQuery.ts`) — so raising this is safe. Adding another cross-render global
        // means route-keying it too; the failure mode is silent mis-attribution, not a crash.
        //
        // Raise with `SSG_CONCURRENCY=N`. The render language is now per-render
        // (`src/ssg/renderLanguage.ts`), as are the dependency keys, the `hqcache:*` seed and
        // the prefetch ordering chain, and `onPageRendered` asserts each page's keys carry the
        // language it actually rendered in.
        //
        // Verified over a 20-route multi-language sample: `ssg-deps.json` is byte-identical at
        // 1 and at 4, and two runs at 1 are byte-identical to each other. Re-run that diff on
        // your own route set before raising it in anger — the file is sorted for exactly this
        // purpose, so any difference is concurrency's doing.
        //
        // Left at 1 by default so parallelism is a deliberate choice rather than a surprise;
        // the build is CPU-bound (a JSDOM per page), so N cores gives roughly N× here.
        concurrency: Number(process.env.SSG_CONCURRENCY || 1),
        includedRoutes: async (_paths: string[], routes: readonly RouteRecordRaw[]) => {
            const apiUrl = env.VITE_API_URL;
            if (!apiUrl) {
                // Fail fast: a partial build that silently drops pages is worse than no build.
                throw new Error("[ssg] VITE_API_URL is required for route enumeration");
            }

            // Always populate the route→language map + default language (used per
            // route by main.web.ts to pick the render language) — including on a
            // scoped rebuild, which still needs the language for its routes.
            const routeEnumerationNow = Date.now();
            // Pin the per-page queries' reference "now" to the enumeration timestamp so a
            // doc published mid-build can't appear on a feed (served from the corpus) as a
            // tile to a slug page that was never prerendered. Must run before the first
            // render, where `mangoIsPublished` captures `sessionNow()` on first read.
            setSessionNow(routeEnumerationNow);
            const slugs = await fetchPublicSlugs(apiUrl, routeEnumerationNow);
            const languages = await fetchLanguages(apiUrl);
            const defaultLanguage = languages.find((l) => l.default === 1) ?? languages[0];
            const langCodes = languages
                .map((l) => l.languageCode)
                .filter((code): code is string => !!code);
            const g = globalThis as Record<string, unknown>;
            g.__SSG_DEFAULT_LANG__ = defaultLanguage?._id ?? "";
            g.__SSG_DEFAULT_LANG_CODE__ = defaultLanguage?.languageCode ?? "";
            g.__SSG_LANG_CODE_TO_ID__ = Object.fromEntries(
                languages
                    .filter((l) => l.languageCode && l._id)
                    .map((l) => [l.languageCode as string, l._id as string]),
            );

            // Private / per-user routes — never prerendered. The public "main" routes
            // (`/`, `/explore`, `/watch`) ARE prerendered via `meta.prerender` (they
            // render their tile collections through the SSG-aware useContentQuery seam).
            const exclude = new Set(["/open", "/settings", "/bookmarks"]);

            // Static public routes flagged for prerender (non-dynamic).
            const staticRoutes = routes
                .filter(
                    (r) => r.meta?.prerender && typeof r.path === "string" && !r.path.includes(":"),
                )
                .map((r) => r.path as string);
            // The 404 error page is prerendered only in the default language (a
            // worker-served custom error page has no per-request locale), so keep
            // it out of the locale-prefixed variants while still prerendering /404
            // itself (it stays in `staticRoutes` → `all`).
            const localizableStatic = staticRoutes.filter((r) => r !== "/404");
            const localizedRoutes = localizedStaticPaths(
                localizableStatic,
                langCodes,
                defaultLanguage?.languageCode ?? "",
            );

            const slugRoutes = slugs.map((s) => `/${s}`);

            const all = [...new Set([...staticRoutes, ...localizedRoutes, ...slugRoutes])].filter(
                (p) => !exclude.has(p),
            );
            prerenderedRoutes = all;

            // The sitemap always represents the full public route set, while a scoped
            // rebuild renders only the explicitly requested routes.
            if (IS_SCOPED) {
                renderedRouteSet = new Set(SCOPED_ROUTES);
                console.log(
                    `[ssg] scoped rebuild of ${SCOPED_ROUTES.length} route(s); sitemap covers ${all.length}`,
                );
                return SCOPED_ROUTES;
            }

            renderedRouteSet = new Set(all);
            console.log(
                `[ssg] prerendering ${all.length} routes ` +
                    `(${staticRoutes.length + localizedRoutes.length} static + ${slugRoutes.length} content)`,
            );
            return all;
        },
        // --- Render-time dependency capture + response-cache seed ---
        onPageRendered: (route, renderedHTML) => {
            // Auth gate is unconditional (every page); the cache seed is only injected
            // when the page actually primed one. Both the keys and the seed were filed
            // under this route as the render produced them, so no per-page reset is needed.
            const state = capture();
            assertRouteLanguage(route, state.manifest[route]);
            const cache = state.cache[route] ?? {};
            const script =
                authGateScript() + (Object.keys(cache).length ? hqCacheScript(cache) : "");

            // The page's HTML is written, so nothing reads these again. Drop them now: the
            // prerender's `localStorage` is an unbounded in-memory Map and `writeResponseCache`
            // only evicts on a quota error it can never raise, so leaving them would retain
            // every page's seed for the whole build (~2k pages) on top of a build that already
            // needs an enlarged heap. Keyed by route so this is safe under concurrency.
            delete state.cache[route];
            releaseSsrChain(route);
            const ls = (globalThis as { localStorage?: { removeItem(k: string): void } })
                .localStorage;
            if (ls) for (const key of Object.keys(cache)) ls.removeItem(key);
            return renderedHTML.includes("</head>")
                ? renderedHTML.replace("</head>", `${script}</head>`)
                : script + renderedHTML;
        },
        onFinished: async () => {
            try {
                // Restore the prerendered home if this scoped rebuild didn't include it.
                if (preservedIndexHtml !== undefined) {
                    writeFileSync(indexHtmlPath(), preservedIndexHtml);
                    console.log("[ssg] restored prerendered index.html (/, not in scope)");
                }
                writeManifest();
                writeRouteIndex();
                writeDocFacets();
                writeDeleteQueue(await fetchDeleteCmds(env.VITE_API_URL));
                if (!IS_SCOPED) {
                    await writeRedirectFiles(env.VITE_API_URL);
                }
                // Sitemap/robots/llms reflect the full route set on both full and scoped builds.
                writeSeoArtifacts();
                // Drain render issues collected during the prerender. A `query-failed` issue
                // means a page's content query rejected, so its section is missing from the
                // emitted HTML — fail the build rather than shipping a silently truncated page
                // (unless SSG_STRICT=0 opts into a warning-only continuation). A `provably-empty`
                // issue is a selector that matched nothing (e.g. an empty `$in`), which is
                // usually a legitimate empty state during a prerender — a personalised feed with
                // no user state, a tag with no tagged documents — so it is reported as a
                // deduplicated warning and never fails the build.
                const issues = takeRenderIssues();
                const failures = issues.filter((i) => i.kind === "query-failed");
                const empties = issues.filter((i) => i.kind === "provably-empty");

                if (empties.length) {
                    // Deduplicate by selector so one empty state hit across many routes is a
                    // single line, not one per route.
                    const groups = new Map<string, { detail: string; routes: string[] }>();
                    for (const issue of empties) {
                        const key = `${issue.kind}::${issue.detail}`;
                        const group = groups.get(key);
                        if (group) group.routes.push(issue.route);
                        else groups.set(key, { detail: issue.detail, routes: [issue.route] });
                    }
                    for (const { detail, routes } of groups.values()) {
                        const examples = routes.slice(0, 3).join(", ");
                        const more = routes.length > 3 ? ` (+${routes.length - 3} more)` : "";
                        console.warn(
                            `[ssg] provably-empty selector (${routes.length} route(s)): ` +
                                `${detail} — ${examples}${more}`,
                        );
                    }
                }

                if (failures.length) {
                    for (const issue of failures) {
                        console.error(
                            `[ssg] render issue: ${issue.route} (${issue.kind}) — ${issue.detail}`,
                        );
                    }
                    if (process.env.SSG_STRICT === "0") {
                        console.warn(
                            `[ssg] SSG_STRICT=0: continuing despite ${failures.length} query-failed render issue(s)`,
                        );
                    } else {
                        throw new Error(
                            `[ssg] prerender recorded ${failures.length} query-failed render issue(s); ` +
                                `set SSG_STRICT=0 to continue`,
                        );
                    }
                }
            } finally {
                // Release the build lock so the ISR watcher may regenerate again.
                if (existsSync(lockPath())) rmSync(lockPath());
            }
        },
    },
};

export default defineConfig(config);
