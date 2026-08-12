import {
    mangoCompile,
    DEFAULT_REMOTE_QUERY_LIMIT,
    type ContentDto,
    type MangoQuery,
} from "luminary-shared";

// The build-time content corpus lives on `globalThis` (not a module-scope variable)
// because vite.config.web.ts (Node) and the Vite-SSG app bundle are separate module
// realms — a module-scope array would be invisible to the config that publishes it.
// Same bridge pattern as dependencyCapture's `__SSG_DEPS__`.
const GLOBAL_KEY = "__SSG_CONTENT_CORPUS__";

function corpus(): ContentDto[] | undefined {
    return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ContentDto[] | undefined;
}

function compareValues(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
    if (a === b) return 0;
    // Missing sorts before present, matching CouchDB's null/missing ordering.
    if (a == null && b != null) return -1;
    if (a != null && b == null) return 1;
    return String(a).localeCompare(String(b));
}

// CouchDB Mango indexes always append the doc `_id` ascending as a final tiebreaker,
// so replicating that keeps a `publishDate desc` ordering identical at a `limit`
// boundary where multiple docs share a publishDate.
function sortDocs(docs: ContentDto[], sort: Array<Record<string, "asc" | "desc">>): ContentDto[] {
    return [...docs].sort((a, b) => {
        for (const spec of sort) {
            for (const [field, dir] of Object.entries(spec)) {
                const cmp = compareValues(
                    (a as Record<string, unknown>)[field],
                    (b as Record<string, unknown>)[field],
                );
                if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
            }
        }
        return compareValues(
            (a as Record<string, unknown>)._id,
            (b as Record<string, unknown>)._id,
        );
    });
}

/**
 * Resolve a Mango query against the build-time content corpus in memory, returning
 * the same docs the anonymous `/query` POST would. Returns `null` when no corpus is
 * published (or the feature is disabled) so the caller falls back to `queryRemote`.
 *
 * The caller owns the gate: a `publishedFilter` query is safe to serve here because
 * its selector bounds results to the published set (publishDate <= now OR coming-soon)
 * the drained corpus holds. A `publishedFilter: false` lookup may match docs outside
 * the corpus, so it still POSTs. An empty match over a present corpus is authoritative
 * (see `resolveQuery`) — never silently re-POSTs to surface a tile for an unprerendered
 * slug.
 */
export function queryContentLocal(q: MangoQuery): ContentDto[] | null {
    if (typeof process !== "undefined" && process.env?.SSG_DISABLE_LOCAL_CONTENT_STORE) {
        return null;
    }
    const all = corpus();
    if (!Array.isArray(all)) return null;

    let docs = all.filter(mangoCompile(q.selector));
    if (Array.isArray(q.$sort) && q.$sort.length) docs = sortDocs(docs, q.$sort);
    const limit = typeof q.$limit === "number" ? q.$limit : DEFAULT_REMOTE_QUERY_LIMIT;
    return docs.slice(0, limit);
}
