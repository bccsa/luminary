/// <reference types="node" />
/**
 * ISR watcher — incremental static regeneration by POLLING.
 *
 * Reuses the SAME mechanism the prerender uses: the anonymous `POST /query`
 * (`queryRemote`) that `build:web`/`useContentQuery` fetch public content with. Every
 * `WATCH_POLL_MS` it asks for content docs whose `updatedTimeUtc` is newer than the last
 * one seen → the changed docs → `keysForChangedDoc` → `computeAffected(keys, manifest)` →
 * a debounced, lock-serialized `build:affected` (which re-runs the queries and regenerates
 * only those `dist-web/*.html`).
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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { HttpReq, initHybridQuery, queryRemote, DocType, type ContentDto } from "luminary-shared";
import { computeAffected, type DepsManifest } from "./computeAffected";
import { keysForChangedDoc } from "./facetKeys";

const apiUrl = loadEnv("", process.cwd()).VITE_API_URL;

const OUT_DIR = join(process.cwd(), "dist-web");
const MANIFEST = join(OUT_DIR, "ssg-deps.json");
const LOCK = join(OUT_DIR, ".ssg-building"); // written by the build, cleared on finish
const POLL_MS = Number(process.env.WATCH_POLL_MS) || 10000;
const DEBOUNCE_MS = Number(process.env.WATCH_DEBOUNCE_MS) || 4000;
// Only react to changes AFTER launch (the initial build:web already has everything older).
// Override with WATCH_SINCE=<epoch-ms> to backfill from a point in time (also: testing).
let lastSeen = Number(process.env.WATCH_SINCE) || Date.now();

// --- pending-change buffer (coalesced across the debounce window) ---
const pendingKeys = new Set<string>();
const pendingSlugs = new Set<string>();
let building = false; // a build:affected WE spawned is in flight
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function loadManifest(): DepsManifest {
    try {
        return JSON.parse(readFileSync(MANIFEST, "utf-8")) as DepsManifest;
    } catch {
        return {};
    }
}

function ingest(doc: ContentDto): void {
    for (const k of keysForChangedDoc(doc)) pendingKeys.add(k);
    if (doc.slug) pendingSlugs.add(`/${doc.slug}`);
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
    if (!pendingKeys.size && !pendingSlugs.size) return;

    const manifest = loadManifest();
    const routes = [...new Set([...computeAffected(pendingKeys, manifest), ...pendingSlugs])].sort();
    pendingKeys.clear();
    pendingSlugs.clear();
    if (!routes.length) return;

    console.log(
        `[watch] regenerating ${routes.length} route(s): ` +
            routes.slice(0, 10).join(", ") +
            (routes.length > 10 ? " …" : ""),
    );
    building = true;
    const child = spawn("npm", ["run", "build:affected"], {
        cwd: process.cwd(),
        env: { ...process.env, SSG_ONLY_ROUTES: routes.join(",") },
        stdio: "inherit",
    });
    child.on("exit", (code) => {
        building = false;
        console.log(`[watch] build:affected exited (${code})`);
        if (pendingKeys.size || pendingSlugs.size) schedule(); // changes arrived mid-build
    });
}

async function poll(): Promise<void> {
    try {
        // Same anonymous POST /query the prerender uses — newest-changed public content.
        const docs = await queryRemote<ContentDto>({
            selector: { $and: [{ type: DocType.Content }, { updatedTimeUtc: { $gt: lastSeen } }] },
            $sort: [{ updatedTimeUtc: "desc" }],
            $limit: 500,
        });
        if (!docs.length) return;
        lastSeen = Math.max(lastSeen, ...docs.map((d) => d.updatedTimeUtc));
        console.log(`[watch] ${docs.length} content doc(s) changed since last poll`);
        docs.forEach(ingest);
        schedule();
    } catch (e) {
        console.error("[watch] poll error:", (e as Error)?.message ?? e);
    }
}

async function main(): Promise<void> {
    if (!apiUrl) throw new Error("[watch] VITE_API_URL not set");
    initHybridQuery(new HttpReq(apiUrl));
    console.log(
        `[watch] polling ${apiUrl} every ${POLL_MS}ms for content changes ` +
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
