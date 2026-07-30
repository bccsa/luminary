/**
 * Content-id / parent-id → prerendered route sidecar (`dist-web/ssg-route-index/`).
 *
 * Why this exists: prerendering writes static HTML files keyed by **route** (slug),
21 * but ISR deletion is driven by a CouchDB DeleteCmd, which historically carried only
 * the deleted doc's **id** — never the slug it was rendered to (the slug lives on the
 * deleted doc itself, so it's gone by the time the deploy repo's watcher sees the
 * DeleteCmd). This sidecar is the persisted id → route mapping that survives the doc's
 * deletion, so `resolveContentDelete` can still answer "which static file(s) does this
 * id correspond to?" and the deploy repo can remove them. A `docId` may be either a
 * single translation's content id (removes one route) or a parent id (removes every
 * translation's route — e.g. a whole post/tag being deleted).
 *
 * Note: `DeleteCmdDto.slug` (`shared/src/types/dto.ts`) now carries the deleted doc's
 * own slug directly on every Content/Redirect DeleteCmd, and a parent Post/Tag delete
 * always cascades into one slug-bearing DeleteCmd per child translation — so a deployer
 * reading `slug` off the DeleteCmd no longer needs this sidecar's `content` map, nor
 * (since each translation's own DeleteCmd already covers its own route) the `parent`
 * fallback. This module is kept for deployer versions that haven't migrated yet.
 *
 * This module only builds the in-memory index; `vite.config.web.ts` shards it to disk
 * (`routeIndexShards.ts`, same fnv1a32-mod-shardCount scheme as `docFacetShards.ts`) so
 * a scoped rebuild only touches the shards its changed docs land in, and a consumer
 * resolving one DeleteCmd loads one small shard file instead of the whole site's index.
 * `resolveContentDelete` itself is shard-agnostic — it works the same against a full
 * index or a single shard's partial `{content, parent}` object.
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
