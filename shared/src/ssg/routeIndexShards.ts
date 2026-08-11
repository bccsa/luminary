/**
 * Fixed hash-bucket sharding for `dist-web/ssg-route-index/` so a scoped rebuild and a
 * single-DeleteCmd lookup each touch one small file instead of the whole route index.
 * Same algorithm as `docFacetShards.ts` (kept separate since the sidecars shard
 * independently). Keep this module PURE (no Vue/DOM/Vite/Node-fs) — file I/O lives in
 * `vite.config.web.ts`. The deploy repo carries its own copy; keep them in sync if the
 * shard count or algorithm changes.
 */

/** Constant regardless of site size — each shard shrinks as docs spread across it. */
export const ROUTE_INDEX_SHARD_COUNT = 64;
export const ROUTE_INDEX_SHARD_ALGORITHM = "fnv1a32-mod";

export type RouteIndexShardsIndex = { shardCount: number; algorithm: string };

function fnv1a32(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Deterministic shard id for a doc id — 2-hex-digit (e.g. "00".."3f" at the default
 * count). Called with either a content id or a parent id: a consumer resolving a
 * DeleteCmd doesn't know in advance which kind of id it has, so it computes this once
 * and checks both the shard's `content` and `parent` maps (see `routeIndex.ts`).
 */
export function routeIndexShard(id: string, shardCount: number = ROUTE_INDEX_SHARD_COUNT): string {
    const bucket = fnv1a32(id) % shardCount;
    return bucket.toString(16).padStart(2, "0");
}

/** Filename (relative to `ssg-route-index/`) for a shard id. */
export const routeIndexShardFile = (shard: string): string => `${shard}.json`;

export const routeIndexShardsIndex = (): RouteIndexShardsIndex => ({
    shardCount: ROUTE_INDEX_SHARD_COUNT,
    algorithm: ROUTE_INDEX_SHARD_ALGORITHM,
});
