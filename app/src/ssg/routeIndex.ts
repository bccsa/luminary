export type SsgRouteIndex = {
    content: Record<string, { route: string; parentId: string }>;
    parent: Record<string, string[]>;
};

type PublicContentRouteDoc = {
    _id?: string;
    parentId?: string;
    slug?: string;
};

export const emptyRouteIndex = (): SsgRouteIndex => ({ content: {}, parent: {} });

export const routeForSlug = (slug: string): string => `/${slug.replace(/^\/+/, "")}`;

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

export function resolveContentDelete(
    docId: string,
    index: SsgRouteIndex,
): { parentId?: string; routes: string[] } {
    const content = index.content[docId];
    if (content) return { parentId: content.parentId, routes: [content.route] };
    const routes = index.parent[docId] ?? [];
    return { parentId: routes.length ? docId : undefined, routes };
}
