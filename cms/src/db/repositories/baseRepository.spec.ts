import { describe, it, afterEach, vi, afterAll, expect } from "vitest";
import { BaseRepository } from "./baseRepository";
import { DocType } from "@/types";

const docsDb = vi.hoisted(() => {
    return {
        where: vi.fn().mockReturnThis(),
        anyOf: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
    };
});

vi.mock("@/db/baseDatabase", () => {
    return {
        db: {
            docs: docsDb,
        },
    };
});

describe("baseRepository", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("can find an item based on type", async () => {
        const repository = new BaseRepository();

        repository.whereType(DocType.Post);

        expect(docsDb.where).toHaveBeenCalledWith("type");
        expect(docsDb.equals).toHaveBeenCalledWith(DocType.Post);
    });

    it("can find an item based on id", async () => {
        const repository = new BaseRepository();

        repository.whereId("test-id");

        expect(docsDb.where).toHaveBeenCalledWith("_id");
        expect(docsDb.equals).toHaveBeenCalledWith("test-id");
    });

    it("can find an item based on several id's", async () => {
        const repository = new BaseRepository();

        repository.whereIds(["test-id", "test-id2"]);

        expect(docsDb.where).toHaveBeenCalledWith("_id");
        expect(docsDb.anyOf).toHaveBeenCalledWith(["test-id", "test-id2"]);
    });
});
