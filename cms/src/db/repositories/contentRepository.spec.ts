import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { ContentRepository } from "./contentRepository";
import { db } from "../baseDatabase";
import {
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
} from "@/tests/mockData";

describe("contentRepository", () => {
    afterEach(() => {
        db.docs.clear();
    });

    it("can get content for a list of id's", async () => {
        db.docs.bulkPut([
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);
        const repository = new ContentRepository();

        const result = await repository.getContentWithIds([
            mockEnglishContentDto._id,
            mockFrenchContentDto._id,
        ]);

        expect(result.length).toBe(2);
        expect(result[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[0].title).toBe(mockEnglishContentDto.title);
        expect(result[0].language.languageCode).toBe("eng");
        expect(result[1]._id).toBe(mockFrenchContentDto._id);
        expect(result[1].title).toBe(mockFrenchContentDto.title);
        expect(result[1].language.languageCode).toBe("fra");
    });
});
