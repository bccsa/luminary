import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db, initDatabase } from "../db/database";
import { initConfig } from "../config";
import { measureQueryCost } from "./measureQueryCost";
import { DocType, type BaseDocumentDto } from "../types";

describe("measureQueryCost", () => {
    beforeAll(async () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://localhost:12345" });
        await initDatabase();
        await db.docs.bulkPut([
            { _id: "a", type: DocType.Language, memberOf: [], updatedTimeUtc: 1 },
            { _id: "b", type: DocType.Language, memberOf: [], updatedTimeUtc: 2 },
        ] as BaseDocumentDto[]);
    });

    it("reports the result's size and a timing for each path", async () => {
        const cost = await measureQueryCost({ selector: { type: DocType.Language } }, 3);

        expect(cost.resultCount).toBe(2);
        expect(cost.resultBytes).toBeGreaterThan(0);
        for (const ms of [cost.mainThreadMs, cost.workerRoundTripMs, cost.cloneMs])
            expect(ms).toBeGreaterThanOrEqual(0);
    });
});
