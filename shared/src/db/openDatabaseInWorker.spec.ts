import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, it, expect } from "vitest";
import { db, initDatabase, openDatabaseInWorker } from "./database";
import { initConfig } from "../config";
import { DocType, PublishStatus, type ContentDto } from "../types";
import { recomputeCorpusStats } from "../fts/ftsIndexer";
import { ftsSearch } from "../fts/ftsSearch";

function makeDoc(_id: string, title: string): ContentDto {
    const fts: string[] = [];
    for (let i = 0; i <= title.length - 3; i++) fts.push(`${title.substring(i, i + 3)}:3`);
    return {
        _id,
        type: DocType.Content,
        parentId: `post-${_id}`,
        parentType: DocType.Post,
        updatedTimeUtc: 1,
        memberOf: ["group-public-content"],
        parentTags: [],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: _id,
        title,
        publishDate: 1,
        fts,
        ftsTokenCount: fts.length,
    } as ContentDto;
}

describe("openDatabaseInWorker", () => {
    it("refuses to create the database before the app has", async () => {
        await expect(openDatabaseInWorker()).rejects.toThrow("does not exist yet");
        expect(await Dexie.exists("luminary-db")).toBe(false);
    });

    it("searches the app's database with the same results as the app's own connection", async () => {
        initConfig({ cms: true, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();
        await db.bulkPut([makeDoc("doc-1", "grace"), makeDoc("doc-2", "gracious")]);
        await recomputeCorpusStats();
        const options = { query: "grace", languageId: "lang-eng" };
        const fromApp = await ftsSearch(options);

        await openDatabaseInWorker();
        const fromWorker = await ftsSearch(options);

        expect(fromApp.length).toBeGreaterThan(0);
        expect(fromWorker).toEqual(fromApp);
    });

    it("exposes every table, so a task reaching past docs does not fail only in a worker", async () => {
        initConfig({ cms: true, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();
        await openDatabaseInWorker();

        await expect(db.docs.count()).resolves.toBeGreaterThanOrEqual(0);
        await expect(db.localChanges.count()).resolves.toBe(0);
        await expect(db.luminaryInternals.count()).resolves.toBeGreaterThanOrEqual(0);
        await expect(db.retention.count()).resolves.toBe(0);
    });
});
