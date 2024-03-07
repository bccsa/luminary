import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { ContentRepository } from "./contentRepository";
import { db } from "../baseDatabase";
import {
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockPostDto,
} from "@/tests/mockData";
import { DocType, type ContentDto, ContentStatus } from "@/types";

describe("contentRepository", () => {
    afterEach(() => {
        db.docs.clear();
    });

    it("can get content for a parent id", async () => {
        db.docs.bulkPut([
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
            mockPostDto,
        ]);
        const repository = new ContentRepository();

        const result = await repository.getContentWithParentId(mockPostDto._id);

        expect(result.length).toBe(2);
        expect(result[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[0].title).toBe(mockEnglishContentDto.title);
        expect(result[0].language.languageCode).toBe("eng");
        expect(result[1]._id).toBe(mockFrenchContentDto._id);
        expect(result[1].title).toBe(mockFrenchContentDto.title);
        expect(result[1].language.languageCode).toBe("fra");
    });

    it("can create content", async () => {
        const repository = new ContentRepository();

        await repository.create({
            parentId: "test-parent-id",
            language: "eng",
            title: "Test title",
        });

        // Assert content was created
        const content = (await db.docs.where("type").equals(DocType.Content).first()) as ContentDto;
        expect(content.title).toBe("Test title");
        expect(content.parentId).toBe("test-parent-id");
        expect(content.language).toBe("eng");
        expect(content.status).toBe(ContentStatus.Draft);

        // Assert content was logged in the localChanges table
        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(1);
        expect(localChanges[0].doc).toEqual(content);
    });
});
