import { describe, it, expect, afterEach, afterAll, beforeAll } from "vitest";
import { DocType, initLuminaryShared } from "../../src";
import { memoryStore } from "../../src/db/memoryStore";

// ============================
// Tests
// ============================
describe("rest", () => {
    beforeAll(async () => {
        await initLuminaryShared({ cms: true, docsIndex: "parentId, language, [type+docType]" });
    });

    afterEach(async () => {});

    afterAll(async () => {});

    it("can add a new entry into the memStore", async () => {
        memoryStore.set(DocType.Group, "key", "value");

        const res = memoryStore.get(DocType.Group, "key");
        expect(res).toBe("value");
    });
});
