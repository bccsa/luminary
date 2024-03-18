import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { db } from "../baseDatabase";
import {
    mockCategoryContentDto,
    mockCategoryDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockPostDto,
} from "@/tests/mockData";
import { PostRepository } from "./postRepository";

describe("postRepository", () => {
    afterEach(() => {
        db.docs.clear();
    });

    it("can get all posts", async () => {
        db.docs.bulkPut([
            mockPostDto,
            mockCategoryDto,
            mockCategoryContentDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);

        const repository = new PostRepository();

        const result = await repository.getAll();

        expect(result.length).toBe(1);
        expect(result[0]._id).toBe(mockPostDto._id);
        expect(result[0].content[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[0].content[0].language._id).toBe(mockLanguageDtoEng._id);
        expect(result[0].updatedTimeUtc.toISODate()).toEqual("2024-01-01");
        expect(result[0].tags[0].content[0].title).toEqual("Category 1");
    });
});
