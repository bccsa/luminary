import {
    type DeleteReason,
    resolveContentDelete,
    routeForSlug,
    type SsgRouteIndex,
} from "luminary-shared";

/**
 * Durable, file-based pending-delete queue (`dist-web/ssg-delete-queue/`). Persists
 * each resolved delete as its own file so a crash between seeing a delete and acting
 * on it can't lose the pending action. This module builds the in-memory queue;
 * `vite.config.web.ts` writes it to disk.
 */

export type SsgDeleteQueueEntry = {
    docType: "content" | "redirect";
    docId: string;
    deleteReason?: DeleteReason;
    language?: string;
    memberOf?: string[];
    newMemberOf?: string[];
    /** Content only: set when a whole-parent delete removes multiple translation routes. */
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
 * Resolves a Content DeleteCmd to its queue entry. Tries the cmd's own `slug` first;
 * falls back to the `ssg-route-index` lookup only when `slug` is absent.
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
