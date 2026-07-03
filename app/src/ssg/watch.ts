/// <reference types="node" />
/**
 * ISR watcher — incremental static regeneration by POLLING.
 *
 * Reuses the SAME mechanism the prerender uses: the anonymous `POST /query`
 * (`queryRemote`) that `build:web`/`useContentQuery` fetch public content with. Every
 * `WATCH_POLL_MS` it asks for content/redirect/delete docs whose `updatedTimeUtc` is
 * newer than the last one seen. Content changes go through previous/new facet snapshots
 * → `computeAffected(keys, manifest)` → a debounced, lock-serialized `build:affected`.
 * Redirect changes write/remove their meta-refresh file directly. DeleteCmds prune
 * deleted content route files + manifest entries, then regenerate surviving co-listed
 * pages via `doc:<parentId>`.
 *
 * Polling (a pull) — not a socket (a push) — on purpose: it's exactly the prerender's
 * public, anonymous REST path, with no socket rooms / accessMap / Dexie / live-sync
 * coupling. The cost is up to `WATCH_POLL_MS` of latency instead of an instant push.
 *
 * Run by the deploy repo, started BEFORE `build:web`: `lastSeen` is stamped at launch, so
 * changes during the long initial build are picked up by polling and flushed after it (the
 * `.ssg-building` lock blocks regenerating while a build runs). Regenerates `dist-web` only
 * — upload/purge is the deploy repo's job. Run: `npm run watch:ssg` (vite-node).
 */
import "./ssgNodeEnv"; // installs window/localStorage so `luminary-shared` can be imported
import { loadEnv } from "vite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import {
    HttpReq,
    initHybridQuery,
    queryRemote,
    DocType,
    type ContentDto,
    type DeleteCmdDto,
    type RedirectDto,
    type MangoQuery,
} from "luminary-shared";
import { computeAffected, type DepsManifest } from "./computeAffected";
import { docKey, keysForChangedDoc, keysForRecategorization, type DocLike } from "./facetKeys";
import type { SsgRedirectIndex } from "./redirectIndex";
import { redirectFile, redirectHtml } from "./redirectHtml";
import {
    emptyRouteIndex,
    resolveContentDelete,
    routeForSlug,
    type SsgRouteIndex,
} from "./routeIndex";

const apiUrl = loadEnv("", process.cwd()).VITE_API_URL;

const OUT_DIR = join(process.cwd(), "dist-web");
const MANIFEST = join(OUT_DIR, "ssg-deps.json");
const ROUTE_INDEX = join(OUT_DIR, "ssg-route-index.json");
const REDIRECT_INDEX = join(OUT_DIR, "ssg-redirect-index.json");
const DOC_FACETS = join(OUT_DIR, "ssg-doc-facets.json");
const LOCK = join(OUT_DIR, ".ssg-building"); // written by the build, cleared on finish
const POLL_MS = Number(process.env.WATCH_POLL_MS) || 10000;
const DEBOUNCE_MS = Number(process.env.WATCH_DEBOUNCE_MS) || 4000;
// Only react to changes AFTER launch (the initial build:web already has everything older).
// Override with WATCH_SINCE=<epoch-ms> to backfill from a point in time (also: testing).
let lastSeen = Number(process.env.WATCH_SINCE) || Date.now();

// --- pending-change buffer (coalesced across the debounce window) ---
const pendingKeys = new Set<string>();
const pendingSlugs = new Set<string>();
const pendingRoutes = new Set<string>(); // routes from a failed build:affected, requeued for the next flush
const pendingRouteDeletes = new Set<string>();
const pendingRedirects = new Map<string, string | undefined>();
const pendingDeletes = new Set<string>();
let building = false; // a build:affected WE spawned is in flight
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let docFacets: Record<string, DocLike> = {};
let redirectIndex: SsgRedirectIndex = {};

function changedSinceQuery(
    type: DocType,
    extra: Record<string, string | number | boolean>[] = [],
): MangoQuery {
    return {
        selector: {
            $and: [{ type }, ...extra, { updatedTimeUtc: { $gt: lastSeen } }],
        },
        $sort: [{ updatedTimeUtc: "desc" }],
        $limit: 10,
    };
}

function loadManifest(): DepsManifest {
    try {
        return JSON.parse(readFileSync(MANIFEST, "utf-8")) as DepsManifest;
    } catch {
        return {};
    }
}

function saveManifest(manifest: DepsManifest): void {
    writeFileSync(MANIFEST, JSON.stringify(manifest));
}

function loadRouteIndex(): SsgRouteIndex {
    try {
        return JSON.parse(readFileSync(ROUTE_INDEX, "utf-8")) as SsgRouteIndex;
    } catch {
        return emptyRouteIndex();
    }
}

function saveRouteIndex(index: SsgRouteIndex): void {
    writeFileSync(ROUTE_INDEX, JSON.stringify(index));
}

function loadRedirectIndex(): SsgRedirectIndex {
    try {
        return JSON.parse(readFileSync(REDIRECT_INDEX, "utf-8")) as SsgRedirectIndex;
    } catch {
        return {};
    }
}

function saveRedirectIndex(index: SsgRedirectIndex): void {
    try {
        mkdirSync(OUT_DIR, { recursive: true });
        writeFileSync(REDIRECT_INDEX, JSON.stringify(index));
    } catch (e) {
        console.warn("[watch] could not save ssg-redirect-index.json:", (e as Error)?.message ?? e);
    }
}

function loadDocFacets(): Record<string, DocLike> {
    try {
        return JSON.parse(readFileSync(DOC_FACETS, "utf-8")) as Record<string, DocLike>;
    } catch {
        return {};
    }
}

function saveDocFacets(facets: Record<string, DocLike>): void {
    try {
        mkdirSync(OUT_DIR, { recursive: true });
        writeFileSync(DOC_FACETS, JSON.stringify(facets));
    } catch (e) {
        console.warn("[watch] could not save ssg-doc-facets.json:", (e as Error)?.message ?? e);
    }
}

function docFacetSnapshot(doc: ContentDto): DocLike {
    return {
        _id: doc._id,
        parentId: doc.parentId,
        parentTags: doc.parentTags ?? [],
        parentPinned: doc.parentPinned,
        language: doc.language,
    };
}

function ingest(doc: ContentDto): void {
    const snapshot = docFacetSnapshot(doc);
    const prev = docFacets[doc._id];
    const keys = prev ? keysForRecategorization(prev, snapshot) : keysForChangedDoc(snapshot);
    for (const k of keys) pendingKeys.add(k);
    docFacets[doc._id] = snapshot;
    const nextRoute = doc.slug ? routeForSlug(doc.slug) : undefined;
    const prevRoute = loadRouteIndex().content[doc._id]?.route;
    if (prevRoute && nextRoute && prevRoute !== nextRoute) pendingRouteDeletes.add(prevRoute);
    if (prevRoute && !nextRoute) pendingRouteDeletes.add(prevRoute);
    if (nextRoute) pendingSlugs.add(nextRoute);
}

function ingestDelete(doc: DeleteCmdDto): void {
    if (doc.docType === DocType.Redirect) {
        const slug = redirectIndex[doc.docId];
        if (slug) pendingRedirects.set(slug, undefined);
        delete redirectIndex[doc.docId];
        return;
    }
    if (doc.docId) pendingDeletes.add(doc.docId);
}

function ingestRedirect(doc: RedirectDto): void {
    if (!doc.slug) return;
    const prevSlug = doc._id ? redirectIndex[doc._id] : undefined;
    if (prevSlug && prevSlug !== doc.slug) pendingRedirects.set(prevSlug, undefined);
    pendingRedirects.set(doc.slug, doc.deleteReq || !doc.toSlug ? undefined : doc.toSlug);
    if (!doc._id) return;
    if (doc.deleteReq || !doc.toSlug) delete redirectIndex[doc._id];
    else redirectIndex[doc._id] = doc.slug;
}

function writeRedirects(redirects: Map<string, string | undefined>, manifest: DepsManifest): void {
    let written = 0;
    let removed = 0;
    for (const [slug, toSlug] of redirects) {
        if (manifest[`/${slug}`]) continue; // prerendered content/static route wins
        const file = join(OUT_DIR, redirectFile(slug));
        if (!toSlug) {
            if (existsSync(file)) {
                rmSync(file);
                removed++;
            }
            continue;
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, redirectHtml(toSlug));
        written++;
    }
    if (written || removed) {
        console.log(`[watch] redirects: wrote ${written}, removed ${removed}`);
    }
}

function contentFile(route: string): string {
    const slug = route.replace(/^\/+/, "");
    return join(OUT_DIR, slug ? `${slug}.html` : "index.html");
}

function pruneRouteIndex(index: SsgRouteIndex, routes: Set<string>): void {
    for (const [id, entry] of Object.entries(index.content)) {
        if (routes.has(entry.route)) delete index.content[id];
    }
    index.parent = {};
    for (const entry of Object.values(index.content)) {
        (index.parent[entry.parentId] ||= []).push(entry.route);
    }
    for (const parentId of Object.keys(index.parent)) {
        index.parent[parentId] = [...new Set(index.parent[parentId])].sort();
    }
}

function applyContentDeletes(docIds: Set<string>, manifest: DepsManifest): Set<string> {
    if (!docIds.size) return new Set();
    const index = loadRouteIndex();
    const removedRoutes = new Set<string>();
    const affectedParents = new Set<string>();

    for (const docId of docIds) {
        const hit = resolveContentDelete(docId, index);
        if (!hit.routes.length) continue;
        if (hit.parentId) affectedParents.add(hit.parentId);
        for (const route of hit.routes) {
            removedRoutes.add(route);
            delete manifest[route];
            rmSync(contentFile(route), { force: true });
        }
    }

    if (!removedRoutes.size) return removedRoutes;
    pruneRouteIndex(index, removedRoutes);
    saveManifest(manifest);
    saveRouteIndex(index);
    for (const parentId of affectedParents) pendingKeys.add(docKey(parentId));
    console.log(`[watch] content deletes: removed ${removedRoutes.size} route file(s)`);
    return removedRoutes;
}

function applyRouteDeletes(routes: Set<string>, manifest: DepsManifest): Set<string> {
    if (!routes.size) return new Set();
    const index = loadRouteIndex();
    for (const route of routes) {
        delete manifest[route];
        rmSync(contentFile(route), { force: true });
    }
    pruneRouteIndex(index, routes);
    saveManifest(manifest);
    saveRouteIndex(index);
    console.log(`[watch] route cleanup: removed ${routes.size} stale route file(s)`);
    return routes;
}

function schedule(): void {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

function flush(): void {
    if (building) return; // our build in flight → its exit handler re-schedules
    if (existsSync(LOCK)) {
        console.log("[watch] a build is in progress (.ssg-building) — deferring regenerate");
        return schedule(); // a build is running (e.g. the initial build:web) → wait
    }
    if (!existsSync(MANIFEST)) {
        console.log("[watch] no dist-web/ssg-deps.json — run build:web first; buffering change");
        return schedule(); // no manifest yet → buffer
    }
    if (
        !pendingKeys.size &&
        !pendingSlugs.size &&
        !pendingRoutes.size &&
        !pendingRouteDeletes.size &&
        !pendingRedirects.size &&
        !pendingDeletes.size
    )
        return;

    const manifest = loadManifest();

    const routeDeletes = new Set(pendingRouteDeletes);
    pendingRouteDeletes.clear();
    const deletes = new Set(pendingDeletes);
    pendingDeletes.clear();
    const removedRoutes = new Set([
        ...applyRouteDeletes(routeDeletes, manifest),
        ...applyContentDeletes(deletes, manifest),
    ]);

    const redirects = new Map(pendingRedirects);
    pendingRedirects.clear();
    writeRedirects(redirects, manifest);
    if (redirects.size) saveRedirectIndex(redirectIndex);

    const routes = new Set([
        ...computeAffected(pendingKeys, manifest),
        ...pendingSlugs,
        ...pendingRoutes,
    ]);
    for (const route of removedRoutes) routes.delete(route);
    pendingKeys.clear();
    pendingSlugs.clear();
    pendingRoutes.clear();
    if (!routes.size) return;

    const routeList = [...routes].sort();
    console.log(
        `[watch] regenerating ${routeList.length} route(s): ` +
            routeList.slice(0, 10).join(", ") +
            (routeList.length > 10 ? " …" : ""),
    );
    building = true;
    const child = spawn("npm", ["run", "build:affected"], {
        cwd: process.cwd(),
        env: { ...process.env, SSG_ONLY_ROUTES: routeList.join(",") },
        stdio: "inherit",
    });
    child.on("exit", (code) => {
        building = false;
        console.log(`[watch] build:affected exited (${code})`);
        if (code !== 0) {
            console.log(`[watch] build:affected failed — requeuing ${routeList.length} route(s)`);
            for (const route of routeList) pendingRoutes.add(route);
        }
        if (
            pendingKeys.size ||
            pendingSlugs.size ||
            pendingRoutes.size ||
            pendingRouteDeletes.size ||
            pendingRedirects.size ||
            pendingDeletes.size
        )
            schedule(); // changes arrived mid-build, or a failed build's routes need retry
    });
}

type WatchDoc = ContentDto | RedirectDto | DeleteCmdDto;

async function poll(): Promise<void> {
    try {
        // Same anonymous POST /query the prerender uses — newest-changed public docs.
        // The API requires `type` and DeleteCmd `docType` to be simple equality values,
        // so keep these as separate queries rather than one `$in` query.
        const [contentDocs, redirects, ...deleteBatches] = await Promise.all([
            queryRemote<ContentDto>(changedSinceQuery(DocType.Content)),
            queryRemote<RedirectDto>(changedSinceQuery(DocType.Redirect)),
            queryRemote<DeleteCmdDto>(
                changedSinceQuery(DocType.DeleteCmd, [{ docType: DocType.Content }]),
            ),
            queryRemote<DeleteCmdDto>(
                changedSinceQuery(DocType.DeleteCmd, [{ docType: DocType.Post }]),
            ),
            queryRemote<DeleteCmdDto>(
                changedSinceQuery(DocType.DeleteCmd, [{ docType: DocType.Tag }]),
            ),
            queryRemote<DeleteCmdDto>(
                changedSinceQuery(DocType.DeleteCmd, [{ docType: DocType.Redirect }]),
            ),
        ]);
        const deletes = deleteBatches.flat();
        const docs: WatchDoc[] = [...contentDocs, ...redirects, ...deletes];
        if (!docs.length) return;
        lastSeen = Math.max(lastSeen, ...docs.map((d) => d.updatedTimeUtc));
        console.log(
            `[watch] ${contentDocs.length} content doc(s), ${redirects.length} redirect doc(s), ${deletes.length} delete cmd(s) changed since last poll`,
        );
        contentDocs.forEach(ingest);
        if (contentDocs.length) saveDocFacets(docFacets);
        redirects.forEach(ingestRedirect);
        deletes.forEach(ingestDelete);
        schedule();
    } catch (e) {
        console.error("[watch] poll error:", (e as Error)?.message ?? e);
    }
}

async function main(): Promise<void> {
    if (!apiUrl) throw new Error("[watch] VITE_API_URL not set");
    initHybridQuery(new HttpReq(apiUrl));
    docFacets = loadDocFacets();
    redirectIndex = loadRedirectIndex();
    console.log(
        `[watch] polling ${apiUrl} every ${POLL_MS}ms for content/redirect/delete changes ` +
            `(since ${new Date(lastSeen).toISOString()})…`,
    );
    if (!existsSync(MANIFEST)) {
        console.log(
            `[watch] NOTE: ${MANIFEST} not found — run build:web first, else changes are` +
                " detected but buffered (no regenerate until the manifest exists).",
        );
    }
    await poll(); // immediate first poll
    setInterval(poll, POLL_MS);
}

main().catch((e) => {
    console.error("[watch] FATAL:", e);
    process.exit(1);
});
