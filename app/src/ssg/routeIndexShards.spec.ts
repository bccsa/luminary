import { describe, it, expect } from "vitest";
import {
    ROUTE_INDEX_SHARD_COUNT,
    routeIndexShard,
    routeIndexShardFile,
    routeIndexShardsIndex,
} from "./routeIndexShards";

describe("routeIndexShards", () => {
    it("is deterministic for the same id", () => {
        expect(routeIndexShard("content-123")).toBe(routeIndexShard("content-123"));
    });

    it("spreads different ids across more than one shard", () => {
        const ids = Array.from({ length: 500 }, (_, i) => `content-${i}`);
        const shards = new Set(ids.map((id) => routeIndexShard(id)));
        expect(shards.size).toBeGreaterThan(1);
    });

    it("never returns a shard outside [0, shardCount)", () => {
        const ids = Array.from({ length: 500 }, (_, i) => `doc-${i}-${Math.random()}`);
        for (const id of ids) {
            const shard = parseInt(routeIndexShard(id), 16);
            expect(shard).toBeGreaterThanOrEqual(0);
            expect(shard).toBeLessThan(ROUTE_INDEX_SHARD_COUNT);
        }
    });

    it("formats shard ids as zero-padded hex", () => {
        expect(routeIndexShard("a")).toMatch(/^[0-9a-f]{2}$/);
    });

    it("respects a custom shard count", () => {
        const shard = parseInt(routeIndexShard("content-123", 4), 16);
        expect(shard).toBeLessThan(4);
    });

    it("builds a stable file name from a shard id", () => {
        expect(routeIndexShardFile("07")).toBe("07.json");
    });

    it("reports the shard count and algorithm consumers need to reproduce shard(id)", () => {
        expect(routeIndexShardsIndex()).toEqual({
            shardCount: ROUTE_INDEX_SHARD_COUNT,
            algorithm: "fnv1a32-mod",
        });
    });
});
