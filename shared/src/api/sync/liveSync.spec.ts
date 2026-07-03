import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { applyLiveData } from "./liveSync";
import { syncList } from "./state";
import type { SyncListEntry } from "./types";
import { db, initDatabase } from "../../db/database";
import { initConfig, config } from "../../config";
import { DocType } from "../../types";

const entry = (over: Partial<SyncListEntry> & { chunkType: string }): SyncListEntry => ({
    memberOf: ["group-a"],
    blockStart: 1,
    blockEnd: 0,
    ...over,
});

describe("liveSync.applyLiveData (sync live persister)", () => {
    beforeAll(async () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "" });
        await initDatabase();
    });

    beforeEach(async () => {
        syncList.value = [];
        config.contentPublishDateCutoff = undefined;
        await db.docs.clear();
        await db.retention.clear();
    });

    it("persists synced-language + best-available fallback content, drops the rest", async () => {
        syncList.value = [
            entry({ chunkType: DocType.Post }),
            entry({ chunkType: `${DocType.Content}:${DocType.Post}`, languages: ["en"] }),
        ];

        await applyLiveData({
            docs: [
                { type: DocType.Post, _id: "doc1" },
                {
                    type: DocType.Content,
                    _id: "doc2",
                    parentType: DocType.Post,
                    language: "en",
                    availableTranslations: ["en"],
                },
                // fr translation whose post ALSO has en (synced) → not best-available → dropped.
                {
                    type: DocType.Content,
                    _id: "doc3",
                    parentType: DocType.Post,
                    language: "fr",
                    availableTranslations: ["en", "fr"],
                },
                // fr-only translation (no en) → kept as the user's fallback.
                {
                    type: DocType.Content,
                    _id: "doc3b",
                    parentType: DocType.Post,
                    language: "fr",
                    availableTranslations: ["fr"],
                },
                { type: DocType.DeleteCmd, _id: "doc4" },
                { type: DocType.Group, _id: "doc5" },
                { type: DocType.User, _id: "doc6" },
            ] as any,
        });

        const ids = (await db.docs.toArray()).map((d) => d._id).sort();
        expect(ids).toEqual(["doc1", "doc2", "doc3b"]);
        // doc3 (fr but en synced-translation exists), doc5 (Group), doc6 (User PII) dropped;
        // doc4 (DeleteCmd) resolved by bulkPut, never stored as a doc.
    });

    it("REGRESSION: a non-keep content update must NOT delete a held local doc (no supersession delete)", async () => {
        // A removed v1 "supersession delete" wiped locally-held content whenever isSyncableDoc
        // rejected it — which it does for ALL content when the syncList has no matching entry
        // (a common transient on load), progressively erasing IndexedDB. applyLiveData must only
        // ever ADD (bulkPut the kept subset) or apply explicit DeleteCmds — never delete a doc
        // just because an incoming update fails the keep gate.
        syncList.value = []; // no entries → isSyncableDoc rejects all content
        await db.docs.bulkPut([
            { type: DocType.Content, _id: "held-en", parentType: DocType.Post, language: "en", updatedTimeUtc: 100 },
            { type: DocType.Content, _id: "held-fr", parentType: DocType.Post, language: "fr", updatedTimeUtc: 100 },
        ] as any);

        await applyLiveData({
            docs: [
                // A newer update for a held doc that fails the (empty-syncList) keep gate.
                { type: DocType.Content, _id: "held-en", parentType: DocType.Post, language: "en", updatedTimeUtc: 200 },
            ] as any,
        });

        // Both held docs survive — nothing is deleted by a failed keep gate.
        const ids = (await db.docs.toArray()).map((d) => d._id).sort();
        expect(ids).toEqual(["held-en", "held-fr"]);
    });

    it("includes all content languages when the entry pins none", async () => {
        syncList.value = [
            entry({ chunkType: DocType.Post }),
            entry({ chunkType: `${DocType.Content}:${DocType.Post}` }),
        ];

        await applyLiveData({
            docs: [
                { type: DocType.Post, _id: "p" },
                { type: DocType.Content, _id: "en", parentType: DocType.Post, language: "en" },
                { type: DocType.Content, _id: "fr", parentType: DocType.Post, language: "fr" },
            ] as any,
        });

        const ids = (await db.docs.toArray()).map((d) => d._id).sort();
        expect(ids).toEqual(["en", "fr", "p"]);
    });

    it("persists below-cutoff Content only if it has a retention row", async () => {
        const CUTOFF = 1_000_000;
        config.contentPublishDateCutoff = CUTOFF;
        syncList.value = [
            entry({ chunkType: `${DocType.Content}:${DocType.Post}`, languages: ["en"] }),
        ];
        // "kept" is a below-cutoff doc we're already keeping offline (retention row present).
        await db.retention.put({ docId: "kept", retainUntil: Date.now() + 1e9 });

        await applyLiveData({
            docs: [
                {
                    type: DocType.Content,
                    _id: "above",
                    parentType: DocType.Post,
                    language: "en",
                    publishDate: CUTOFF + 5000,
                },
                {
                    type: DocType.Content,
                    _id: "kept",
                    parentType: DocType.Post,
                    language: "en",
                    publishDate: CUTOFF - 1000,
                },
                {
                    type: DocType.Content,
                    _id: "uncached",
                    parentType: DocType.Post,
                    language: "en",
                    publishDate: CUTOFF - 2000,
                },
            ] as any,
        });

        const ids = (await db.docs.toArray()).map((d) => d._id).sort();
        expect(ids).toContain("above"); // above-cutoff → always persisted
        expect(ids).toContain("kept"); // below-cutoff but retention-listed
        expect(ids).not.toContain("uncached"); // below-cutoff, not kept → dropped
    });

    it("persists below-cutoff Content when parentAlwaysOffline is true without a retention row", async () => {
        const CUTOFF = 1_000_000;
        config.contentPublishDateCutoff = CUTOFF;
        syncList.value = [
            entry({ chunkType: `${DocType.Content}:${DocType.Post}`, languages: ["en"] }),
        ];

        await applyLiveData({
            docs: [
                {
                    type: DocType.Content,
                    _id: "always-offline",
                    parentType: DocType.Post,
                    language: "en",
                    publishDate: CUTOFF - 1000,
                    parentAlwaysOffline: true,
                },
            ] as any,
        });

        const ids = (await db.docs.toArray()).map((d) => d._id);
        expect(ids).toContain("always-offline");
    });
});
