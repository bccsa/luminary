import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { db, initDatabase } from "../db/database";
import { initConfig } from "../config";
import { DocType, PublishStatus, type ContentDto } from "../types";
import { cachedPrimaryKeys } from "./indexKeyCache";
import { ftsSearch } from "./ftsSearch";
import { recomputeCorpusStats } from "./ftsIndexer";

const content = (id: string, trigrams: string[]): ContentDto =>
    ({
        _id: id,
        type: DocType.Content,
        parentId: "post-1",
        parentType: DocType.Post,
        updatedTimeUtc: 1,
        memberOf: ["group-public-content"],
        language: "lang-eng",
        status: PublishStatus.Published,
        title: id,
        publishDate: 1,
        fts: trigrams.map((t) => `${t}:1`),
        ftsTokenCount: trigrams.length,
    }) as ContentDto;

describe("cachedPrimaryKeys", () => {
    beforeAll(async () => {
        initConfig({ cms: true, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();
    });

    beforeEach(async () => {
        await db.docs.clear();
        await db.luminaryInternals.clear();
    });

    it("reads a range once until the docs table changes", async () => {
        await db.docs.put(content("c1", ["abc"]));
        const read = vi.fn(() => db.docs.where("language").equals("lang-eng").primaryKeys());

        expect(await cachedPrimaryKeys("test:lang", read)).toEqual(["c1"]);
        expect(await cachedPrimaryKeys("test:lang", read)).toEqual(["c1"]);
        expect(read).toHaveBeenCalledTimes(1);

        await db.docs.put(content("c2", ["abc"]));
        expect((await cachedPrimaryKeys("test:lang", read)).sort()).toEqual(["c1", "c2"]);
        expect(read).toHaveBeenCalledTimes(2);
    });

    it("lets a search find a doc added after an earlier search", async () => {
        await db.docs.put(content("c1", ["gar", "ard", "rde", "den"]));
        await recomputeCorpusStats();
        expect(
            (
                await ftsSearch({
                    query: "garden",
                    languageId: "lang-eng",
                    maxTrigramDocPercent: 100,
                })
            ).map((r) => r.docId),
        ).toEqual(["c1"]);

        await db.docs.put(content("c2", ["gar", "ard", "rde", "den"]));
        await recomputeCorpusStats();
        const ids = (
            await ftsSearch({ query: "garden", languageId: "lang-eng", maxTrigramDocPercent: 100 })
        ).map((r) => r.docId);
        expect(ids.sort()).toEqual(["c1", "c2"]);
    });
});
