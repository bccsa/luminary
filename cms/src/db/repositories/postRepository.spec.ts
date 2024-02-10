import "fake-indexeddb/auto";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { db } from "../baseDatabase";
import {
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageEng,
    mockLanguageFra,
    mockPostDto,
} from "@/tests/mockData";
import { PostRepository } from "./postRepository";

describe("postRepository", () => {
    beforeEach(() => {
        db.docs.bulkPut([
            mockPostDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageEng,
            mockLanguageFra,
        ]);
    });

    afterEach(() => {
        db.docs.clear();
    });

    it("can find all posts", async () => {
        const repository = new PostRepository();

        const result = await repository.findAll();

        expect(result.length).toBe(1);
        expect(result[0]._id).toBe(mockPostDto._id);
        expect(result[0].content[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[0].content[0].language._id).toBe(mockLanguageEng._id);
    });
});
