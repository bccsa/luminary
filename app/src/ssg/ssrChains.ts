/**
 * Per-route serialization chain for SSG prefetch fetches, so chained queries (e.g.
 * SingleContent: content → translations → tags reads content's resolved parentId)
 * resolve correctly — vite-ssg awaits a page's onServerPrefetch hooks concurrently, so
 * without this the child would build its selector from the still-empty parent ref.
 *
 * Per route, not global: only queries within one page can depend on each other, while a
 * single shared chain would also serialize every page against every other, holding the
 * whole prerender to one in-flight request no matter what `concurrency` is set to.
 *
 * Extracted into its own pure module (no Vue/Dexie/DOM/import.meta, matching
 * src/ssg/facetKeys.ts's convention) so vite.config.web.ts can release a route's entry
 * once its page has rendered without importing useContentQuery.ts's Vue-wired code into
 * the Node-only tsconfig project.
 */
const ssrChains = new Map<string, Promise<unknown>>();

export function chainFor(route: string): Promise<unknown> {
    return ssrChains.get(route) ?? Promise.resolve();
}

export function queueOnChain(route: string, next: Promise<unknown>): void {
    ssrChains.set(route, next);
}

/** Frees a route's chain entry once its page has fully rendered. */
export function releaseSsrChain(route: string): void {
    ssrChains.delete(route);
}
