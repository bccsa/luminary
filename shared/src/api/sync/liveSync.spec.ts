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

    it("persists only docs in the sync syncList scope (type + parentType + language)", async () => {
        syncList.value = [
            entry({ chunkType: DocType.Post }),
            entry({ chunkType: `${DocType.Content}:${DocType.Post}`, languages: ["en"] }),
        ];

        await applyLiveData({
            docs: [
                { type: DocType.Post, _id: "doc1" },
                { type: DocType.Content, _id: "doc2", parentType: DocType.Post, language: "en" },
                { type: DocType.Content, _id: "doc3", parentType: DocType.Post, language: "fr" },
                { type: DocType.DeleteCmd, _id: "doc4" },
                { type: DocType.Group, _id: "doc5" },
                { type: DocType.User, _id: "doc6" },
            ] as any,
        });

        const ids = (await db.docs.toArray()).map((d) => d._id).sort();
        expect(ids).toEqual(["doc1", "doc2"]);
        // doc3 (fr, not a synced language), doc5 (Group, not synced), doc6 (User PII) dropped;
        // doc4 (DeleteCmd) resolved by bulkPut, never stored as a doc.
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
});
