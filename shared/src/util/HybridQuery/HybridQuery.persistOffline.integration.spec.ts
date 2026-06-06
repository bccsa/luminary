import "fake-indexeddb/auto";
import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from "vitest";
import { ref } from "vue";

// End-to-end integration: REAL db (fake-indexeddb), REAL retention buffer, REAL
// isSyncableDoc, REAL mangoToDexie + useDexieLiveQuery local read, REAL config. The
// ONLY stub is the API HTTP service (the `/query` supplement) so we control what the
// remote returns, plus the debounced corpus-stats recompute (avoids a leaked timer).
vi.mock("../../fts/ftsIndexer", async (importOriginal) => {
    const orig = await importOriginal<typeof import("../../fts/ftsIndexer")>();
    return { ...orig, scheduleCorpusStatsRecompute: vi.fn() };
});

import { db, initDatabase } from "../../db/database";
import { flushRetention, resetRetentionBuffer } from "../../db/retention";
import { initConfig, config } from "../../config";
import { isConnected } from "../../socket/socketio";
import { HybridQuery, initHybridQuery } from "./HybridQuery";
import { DocType, type BaseDocumentDto, type ContentDto } from "../../types";

const CUTOFF = 1_000_000;
const below1 = CUTOFF - 1000;
const below2 = CUTOFF - 2000;
const above = CUTOFF + 5000;

const content = (_id: string, publishDate: number, over: Partial<ContentDto> = {}): BaseDocumentDto =>
    ({
        _id,
        type: DocType.Content,
        parentType: DocType.Post,
        language: "lang-en",
        publishDate,
        memberOf: ["g1"],
        updatedTimeUtc: publishDate,
        ...over,
    }) as unknown as BaseDocumentDto;

describe("HybridQuery persistOffline — real Dexie integration", () => {
    let post: ReturnType<typeof vi.fn>;
    const instances: HybridQuery<ContentDto>[] = [];
    const make = (opts: ConstructorParameters<typeof HybridQuery>[1]): HybridQuery<ContentDto> => {
        const q = new HybridQuery<ContentDto>({ selector: { type: DocType.Content } }, opts);
        instances.push(q);
        return q;
    };

    beforeAll(async () => {
        initConfig({
            cms: false,
            docsIndex: "[type+postType]",
            apiUrl: "http://localhost:12345",
            contentPublishDateCutoff: CUTOFF,
            appLanguageIdsAsRef: ref(["lang-en"]),
            syncList: [{ type: DocType.Post, contentOnly: true, sync: true }],
        });
        await initDatabase();
    });

    beforeEach(async () => {
        resetRetentionBuffer();
        await db.docs.clear();
        await db.retention.clear();
        config.cms = false;
        config.contentPublishDateCutoff = CUTOFF;
        isConnected.value = true;
        post = vi.fn().mockResolvedValue({ docs: [] });
        initHybridQuery({ post } as any);
    });

    afterEach(() => {
        instances.splice(0).forEach((q) => q.dispose());
        resetRetentionBuffer();
    });

    it("persists the below-cutoff supplement into db.docs AND stamps db.retention", async () => {
        await db.docs.bulkPut([content("local-above", above)]);
        post.mockResolvedValue({
            docs: [content("remote-old1", below1), content("remote-old2", below2)],
        });

        const q = make({ persistOffline: true });

        // The supplement docs end up in the MAIN docs table (not a separate one).
        await vi.waitFor(async () => {
            expect(await db.docs.get("remote-old1")).toBeDefined();
            expect(await db.docs.get("remote-old2")).toBeDefined();
        });

        expect(q.output.value.map((d) => d._id).sort()).toEqual([
            "local-above",
            "remote-old1",
            "remote-old2",
        ]);

        // Retention stamps are buffered → flush, then assert real rows exist.
        await flushRetention();
        const stamp = await db.retention.get("remote-old1");
        expect(stamp).toBeDefined();
        expect(stamp!.retainUntil).toBeGreaterThan(Date.now());
        expect(await db.retention.get("remote-old2")).toBeDefined();
    });

    it("hard floor: a non-syncable supplement doc is shown but NEVER written to IndexedDB", async () => {
        post.mockResolvedValue({
            docs: [
                content("ok", below1), // parentType Post → syncable
                content("not-syncable", below2, { parentType: DocType.Tag }), // Tag not in syncList
            ],
        });

        const q = make({ persistOffline: true });

        await vi.waitFor(async () => {
            expect(await db.docs.get("ok")).toBeDefined();
        });
        // Both visible in the merged output…
        expect(q.output.value.map((d) => d._id).sort()).toEqual(["not-syncable", "ok"]);
        // …but the non-syncable one is gated out of IndexedDB by isSyncableDoc.
        expect(await db.docs.get("not-syncable")).toBeUndefined();
    });

    it("persistOffline off: the supplement shows in output but is NOT persisted or stamped", async () => {
        await db.docs.bulkPut([content("local-above", above)]);
        post.mockResolvedValue({ docs: [content("remote-old1", below1)] });

        const q = make({}); // default — no persistence

        await vi.waitFor(() => {
            expect(q.output.value.map((d) => d._id)).toContain("remote-old1");
        });

        expect(await db.docs.get("remote-old1")).toBeUndefined(); // in-memory _remote only
        await flushRetention();
        expect(await db.retention.get("remote-old1")).toBeUndefined(); // not a _local doc → not stamped
    });

    it("universal retention: a below-cutoff doc already local is stamped even without persistOffline", async () => {
        // Simulates content that slid below the cutoff: it's in IndexedDB and served by
        // a plain query, so the unconditional _recompute stamping keeps it alive.
        await db.docs.bulkPut([content("slid-below", below1)]);
        post.mockResolvedValue({ docs: [] });

        const q = make({}); // plain query, no persistOffline

        await vi.waitFor(() => {
            expect(q.output.value.map((d) => d._id)).toContain("slid-below");
        });

        await flushRetention();
        expect(await db.retention.get("slid-below")).toBeDefined();
    });
});
