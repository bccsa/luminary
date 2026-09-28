import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

// Real db (fake-indexeddb) + real mangoToDexie. jsdom has no `Worker`, so these exercise the
// main-thread fallback — the path every worker failure degrades to.
import { db, initDatabase } from "../db/database";
import { config, initConfig } from "../config";
import { subscribeInWorker } from "./workerClient";
import { HybridQuery } from "../util/HybridQuery/HybridQuery";
import { DocType, type BaseDocumentDto } from "../types";

const content = (_id: string, publishDate: number): BaseDocumentDto =>
    ({
        _id,
        type: DocType.Content,
        memberOf: ["g1"],
        publishDate,
        updatedTimeUtc: publishDate,
    }) as unknown as BaseDocumentDto;

const ids = (docs: BaseDocumentDto[] | undefined) => (docs ?? []).map((d) => d._id).sort();

describe("subscribeInWorker (main-thread fallback)", () => {
    beforeAll(async () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();
    });

    beforeEach(async () => {
        await db.docs.clear();
    });

    it("emits the current result, then again after every write that changes it", async () => {
        await db.docs.bulkPut([content("a", 1)]);
        let latest: BaseDocumentDto[] | undefined;
        const stop = subscribeInWorker(
            "mangoQuery",
            { selector: { type: DocType.Content } },
            { next: (docs) => (latest = docs) },
        );

        await vi.waitFor(() => expect(ids(latest)).toEqual(["a"]));
        await db.docs.bulkPut([content("b", 2)]);
        await vi.waitFor(() => expect(ids(latest)).toEqual(["a", "b"]));
        await db.docs.delete("a");
        await vi.waitFor(() => expect(ids(latest)).toEqual(["b"]));
        stop();
    });

    it("stops emitting once unsubscribed", async () => {
        let emissions = 0;
        const stop = subscribeInWorker(
            "mangoQuery",
            { selector: { type: DocType.Content } },
            { next: () => emissions++ },
        );
        await vi.waitFor(() => expect(emissions).toBe(1));
        stop();

        await db.docs.bulkPut([content("a", 1)]);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(emissions).toBe(1);
    });
});

describe("HybridQuery live mode with liveQueriesInWorker", () => {
    beforeAll(async () => {
        initConfig({
            cms: false,
            docsIndex: "",
            apiUrl: "http://localhost:12345",
            liveQueriesInWorker: true,
        });
        await initDatabase();
    });

    beforeEach(async () => {
        await db.docs.clear();
    });

    afterEach(() => {
        config.liveQueriesInWorker = false;
    });

    it("keeps output current across later writes rather than emitting once", async () => {
        await db.docs.bulkPut([content("a", 1)]);
        const scope = effectScope();
        const q = scope.run(
            () => new HybridQuery({ selector: { type: DocType.Content } }, { live: true }),
        )!;

        await vi.waitFor(() => expect(ids(q.output.value)).toEqual(["a"]));
        await db.docs.bulkPut([content("b", 2)]);
        await vi.waitFor(() => expect(ids(q.output.value)).toEqual(["a", "b"]));

        scope.stop();
    });
});
