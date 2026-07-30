import type { DeleteReason } from "luminary-shared";
import { resolveContentDelete, routeForSlug, type SsgRouteIndex } from "./routeIndex";

/**
 * Durable, file-based pending-delete queue (`dist-web/ssg-delete-queue/`).
 *
 * Why this exists: today, "a doc was deleted" is known only as a transient fact the
 * deploy repo's ISR watcher observes while polling `DeleteCmd` docs from CouchDB — if
 * the watcher crashes between seeing the DeleteCmd and finishing the storage-delete +
 * CDN-purge for it, that pending action can be lost. `DeleteCmd` docs are a permanent,
 * never-pruned ledger, so the *fact* of the delete is never lost — but there was no
 * persisted record of *whether it's been acted on yet*. This sidecar is that record: a
 * build resolves each `DeleteCmd` to the concrete artifact(s) it must remove and writes
 * one file per `DeleteCmd`, named by the `DeleteCmd`'s own `_id` (`<id>.json`). The
 * deploy repo reads it, performs the actual delete + purge, then deletes that one file
 * itself once done — a crash at any point just means the file is still there on the
 * next pass, no shared/merged state to lose sync with.
 *
 * One file per entry rather than sharded, unlike `ssg-route-index`/`ssg-doc-facets`:
 * this sidecar is consumed entirely locally by the deploy repo (never uploaded to
 * R2/Cloudflare, per ADR 0018 — sharding's rationale of bounding what a consumer must
 * load/rewrite doesn't need a bucketing scheme when each entry already IS its own
 * file), and "processed" becomes a plain `rm <id>.json` with no read-merge-write race
 * against other entries sharing a file.
 *
 * `DeleteCmdDto.slug` (`shared/src/types/dto.ts`) now carries the deleted doc's own
 * slug directly, so a Content/Redirect DeleteCmd resolves to its route without needing
 * `ssg-route-index`/`ssg-redirect-index`'s lookup. Those sidecars are kept as a
 * fallback here only for legacy (pre-`slug`-field) DeleteCmds still sitting in the
 * permanent ledger — see `resolveContentDeleteQueueEntry` / `resolveRedirectDeleteQueueEntry`.
 * The rest of the DeleteCmd's own fields (`deleteReason`/`language`/`memberOf`/
 * `newMemberOf`) ride along unchanged on the entry too — nothing here ever leaves the
 * server, so there's no size pressure to strip them, and keeping them makes an entry
 * self-describing without cross-referencing CouchDB.
 *
 * This module only builds the in-memory queue; `vite.config.web.ts` writes it to disk.
 */

export type SsgDeleteQueueEntry = {
    docType: "content" | "redirect";
    docId: string;
    deleteReason?: DeleteReason;
    language?: string;
    memberOf?: string[];
    newMemberOf?: string[];
    /** Content only, legacy-fallback whole-parent cascade (multiple routes removed). */
    parentId?: string;
    routes: string[];
    files: string[];
};

/** Keyed by the DeleteCmd doc's own `_id` — never reused, so it's a stable file name. */
export type SsgDeleteQueue = Record<string, SsgDeleteQueueEntry>;

export type DeleteCmdLike = {
    _id?: string;
    docId?: string;
    slug?: string;
    deleteReason?: DeleteReason;
    language?: string;
    memberOf?: string[];
    newMemberOf?: string[];
};

/** Maps a route to the static file `vite-ssg`'s flat `dirStyle` writes it to under
 * `dist-web` — deliberately the same formula as `redirectHtml.ts`'s `redirectFile`, so
 * a content route and a redirect slug resolve to an identical storage-key convention. */
export function routeToStaticFile(route: string): string {
    return `${route.replace(/^\/+/, "")}.html`;
}

function passthrough(cmd: DeleteCmdLike) {
    return {
        deleteReason: cmd.deleteReason,
        language: cmd.language,
        memberOf: cmd.memberOf,
        newMemberOf: cmd.newMemberOf,
    };
}

/**
 * Resolves a Content DeleteCmd to the queue entry it needs. Slug-first (new-style
 * DeleteCmds self-describe their own route — always exactly one, since each
 * translation's own DeleteCmd now carries its own slug). Falls back to the legacy
 * `ssg-route-index` lookup (`resolveContentDelete`, reused as-is: it already handles
 * both a single-translation id and a whole-parent-id cascade) only when `slug` is
 * missing — a DeleteCmd created before that field existed.
 */
export function resolveContentDeleteQueueEntry(
    cmd: DeleteCmdLike,
    legacyRouteIndex?: SsgRouteIndex,
): SsgDeleteQueueEntry | undefined {
    if (!cmd.docId) return undefined;

    if (cmd.slug) {
        const route = routeForSlug(cmd.slug);
        return {
            docType: "content",
            docId: cmd.docId,
            ...passthrough(cmd),
            routes: [route],
            files: [routeToStaticFile(route)],
        };
    }

    if (!legacyRouteIndex) return undefined;
    const { parentId, routes } = resolveContentDelete(cmd.docId, legacyRouteIndex);
    if (!routes.length) return undefined;
    return {
        docType: "content",
        docId: cmd.docId,
        ...passthrough(cmd),
        parentId,
        routes,
        files: routes.map(routeToStaticFile),
    };
}

/**
 * Resolves a Redirect DeleteCmd the same slug-first-then-legacy-fallback way. No
 * `status` field — that 301/302 distinction only matters for an *active* redirect
 * being served, not one being removed.
 */
export function resolveRedirectDeleteQueueEntry(
    cmd: DeleteCmdLike,
    legacySlug?: string,
): SsgDeleteQueueEntry | undefined {
    if (!cmd.docId) return undefined;
    const slug = cmd.slug ?? legacySlug;
    if (!slug) return undefined;
    const route = routeForSlug(slug);
    return {
        docType: "redirect",
        docId: cmd.docId,
        ...passthrough(cmd),
        routes: [route],
        files: [routeToStaticFile(route)],
    };
}

/**
 * Builds the full queue from this build's drained DeleteCmd docs. Entries lacking an
 * `_id` (the queue's file-naming key) or that can't be resolved to any route are
 * silently dropped — an unresolvable legacy DeleteCmd (no slug, no matching legacy
 * sidecar entry) has nothing this build can act on; it isn't an error.
 */
export function buildDeleteQueue(
    contentCmds: DeleteCmdLike[],
    redirectCmds: DeleteCmdLike[],
    legacyRouteIndex?: SsgRouteIndex,
    legacyRedirectSlugs?: Record<string, string>,
): SsgDeleteQueue {
    const queue: SsgDeleteQueue = {};

    for (const cmd of contentCmds) {
        if (!cmd._id) continue;
        const entry = resolveContentDeleteQueueEntry(cmd, legacyRouteIndex);
        if (entry) queue[cmd._id] = entry;
    }

    for (const cmd of redirectCmds) {
        if (!cmd._id) continue;
        const legacySlug = cmd.docId ? legacyRedirectSlugs?.[cmd.docId] : undefined;
        const entry = resolveRedirectDeleteQueueEntry(cmd, legacySlug);
        if (entry) queue[cmd._id] = entry;
    }

    return queue;
}
