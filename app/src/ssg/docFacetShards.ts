/**
 * Fixed hash-bucket sharding for `dist-web/ssg-doc-facets/`. Splits the doc-facet
 * snapshot (see `facetKeys.ts`'s "Doc facet snapshot") across a constant number of
 * small files instead of one file that grows with the site, so a scoped rebuild only
 * reads/writes the few shards its changed docs land in, and a consumer can process
 * shards one at a time instead of holding the whole dataset in memory. The deploy
 * repo carries its own copy of this module (like `facetKeys.ts`) — keep them in sync
 * if the shard count or algorithm ever changes.
 *
 * Keep this module PURE: no Vue/DOM/Vite/Node-fs deps — file I/O lives in
 * `vite.config.web.ts`, not here.
 */

/** Constant regardless of site size — each shard shrinks as docs spread across it. */
export const DOC_FACETS_SHARD_COUNT = 64;
export const DOC_FACETS_SHARD_ALGORITHM = "fnv1a32-mod";

export type DocFacetsIndex = { shardCount: number; algorithm: string };

function fnv1a32(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** Deterministic shard id for a doc id — 2-hex-digit (e.g. "00".."3f" at the default count). */
export function docFacetShard(id: string, shardCount: number = DOC_FACETS_SHARD_COUNT): string {
    const bucket = fnv1a32(id) % shardCount;
    return bucket.toString(16).padStart(2, "0");
}

/** Filename (relative to `ssg-doc-facets/`) for a shard id. */
export const docFacetShardFile = (shard: string): string => `${shard}.json`;

export const docFacetsIndex = (): DocFacetsIndex => ({
    shardCount: DOC_FACETS_SHARD_COUNT,
    algorithm: DOC_FACETS_SHARD_ALGORITHM,
});
