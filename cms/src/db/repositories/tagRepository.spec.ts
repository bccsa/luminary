import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { db } from "../baseDatabase";
import { mockCategoryContentDto, mockCategoryDto, mockLanguageDtoEng } from "@/tests/mockData";
import { TagRepository } from "./tagRepository";

describe("tagRepository", () => {
    afterEach(() => {
        db.localChanges.clear();
        db.docs.clear();
    });

    it("can get all tags", async () => {
        db.docs.bulkPut([mockCategoryDto, mockCategoryContentDto, mockLanguageDtoEng]);

        const repository = new TagRepository();

        const result = await repository.getAll();

        expect(result.length).toBe(1);
        expect(result[0]._id).toBe(mockCategoryDto._id);
        expect(result[0].content[0]._id).toBe(mockCategoryContentDto._id);
        expect(result[0].content[0].language._id).toBe(mockLanguageDtoEng._id);
        expect(result[0].updatedTimeUtc.toISODate()).toEqual("2024-01-01");
    });
});
