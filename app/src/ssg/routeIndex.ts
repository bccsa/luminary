/**
 * Content-id / parent-id → prerendered route sidecar (`dist-web/ssg-route-index.json`).
 * A CouchDB DeleteCmd only carries a doc/parent id, not the route it was rendered
 * to, so this lets `resolveContentDelete` map that id back to the static file(s) to remove.
 */

export type SsgRouteIndex = {
    /** Single translation: content doc id → its own route + parent id. */
    content: Record<string, { route: string; parentId: string }>;
    /** All translations sharing a parent: parent id → every translation's route. */
    parent: Record<string, string[]>;
};

type PublicContentRouteDoc = {
    _id?: string;
    parentId?: string;
    slug?: string;
};

export const emptyRouteIndex = (): SsgRouteIndex => ({ content: {}, parent: {} });

/** Normalizes a stored slug (which may or may not carry a leading slash) to a route. */
export const routeForSlug = (slug: string): string => `/${slug.replace(/^\/+/, "")}`;

/** Builds the index from the same public content docs used for route enumeration. */
export function buildRouteIndex(docs: PublicContentRouteDoc[]): SsgRouteIndex {
    const index = emptyRouteIndex();
    for (const doc of docs) {
        if (!doc._id || !doc.slug) continue;
        const parentId = doc.parentId || doc._id;
        const route = routeForSlug(doc.slug);
        index.content[doc._id] = { route, parentId };
        (index.parent[parentId] ||= []).push(route);
    }
    for (const parentId of Object.keys(index.parent)) {
        index.parent[parentId] = [...new Set(index.parent[parentId])].sort();
    }
    return index;
}

/**
 * Resolves a DeleteCmd's doc id to the static route(s) it must remove. `docId` may
 * be either a single translation's content id (one route) or a parent id (every
 * translation's route — e.g. a whole post/tag being deleted).
 */
export function resolveContentDelete(
    docId: string,
    index: SsgRouteIndex,
): { parentId?: string; routes: string[] } {
    const content = index.content[docId];
    if (content) return { parentId: content.parentId, routes: [content.route] };
    const routes = index.parent[docId] ?? [];
    return { parentId: routes.length ? docId : undefined, routes };
}
