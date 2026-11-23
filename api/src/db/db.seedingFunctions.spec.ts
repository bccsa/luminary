import { DbService } from "./db.service";
import { upsertDesignDocs, upsertSeedingDocs } from "./db.seedingFunctions";

describe("database asset loading (mocked databases)", () => {
    const mockDb = () => ({ upsertDoc: jest.fn().mockResolvedValue({}) });

    it("installs content indexes without owner-scoped partitioned indexes", async () => {
        const db = mockDb();
        await upsertDesignDocs(db as unknown as DbService);
        const docs = db.upsertDoc.mock.calls.map(([doc]) => doc);
        expect(docs.length).toBeGreaterThan(0);
        expect(docs.some((doc) => doc._id === "_design/sync-content-index")).toBe(true);
        expect(docs.every((doc) => doc.options?.partitioned !== true)).toBe(true);
        expect(
            docs.some((doc) =>
                /^_design\/sync-(viewed|liked|highlighted|userActivity)-index$/.test(doc._id),
            ),
        ).toBe(false);
    });

    it("uses the supplied database for every invocation instead of keeping the first one", async () => {
        const first = mockDb();
        const second = mockDb();
        await upsertDesignDocs(first as unknown as DbService);
        const count = first.upsertDoc.mock.calls.length;
        await upsertDesignDocs(second as unknown as DbService);
        expect(first.upsertDoc).toHaveBeenCalledTimes(count);
        expect(second.upsertDoc).toHaveBeenCalledTimes(count);
    });

    it("loads the complete content seed set only into the supplied target", async () => {
        const first = mockDb();
        const second = mockDb();
        await upsertSeedingDocs(first as unknown as DbService);
        const count = first.upsertDoc.mock.calls.length;
        await upsertSeedingDocs(second as unknown as DbService);
        expect(first.upsertDoc).toHaveBeenCalledTimes(count);
        expect(second.upsertDoc).toHaveBeenCalledTimes(count);
        const docs = second.upsertDoc.mock.calls.map(([doc]) => doc);
        expect(docs.some((doc) => doc._id === "lang-eng")).toBe(true);
        expect(docs.some((doc) => doc._id === "lang-fra")).toBe(true);
        expect(
            docs.every(
                (doc) => !["userActivity", "viewed", "liked", "highlighted"].includes(doc.type),
            ),
        ).toBe(true);
    });
});
