import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { db } from "../baseDatabase";
import {
    mockCategory,
    mockCategoryContentDto,
    mockCategoryDto,
    mockEnglishCategoryContent,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
} from "@/tests/mockData";
import { TagRepository } from "./tagRepository";
import {
    type Content,
    type Post,
    DocType,
    type PostDto,
    type ContentDto,
    type Tag,
    type TagDto,
} from "@/types";

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

    it("can update a tag", async () => {
        db.docs.bulkPut([
            mockCategoryDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);
        const repository = new TagRepository();
        const content: Content = {
            ...mockEnglishCategoryContent,
            title: "Updated Title",
            publishDate: undefined,
        };
        const tag: Tag = {
            ...mockCategory,
            image: "updatedImage.jpg",
        };

        await repository.update(content, tag);

        // Assert content and post were created in local database
        const dbTag = (await db.docs.where("_id").equals(tag._id).first()) as TagDto;
        expect(dbTag.image).toBe("updatedImage.jpg");

        const dbContent = (await db.docs.where("_id").equals(content._id).first()) as ContentDto;
        expect(dbContent.title).toBe("Updated Title");
        expect(dbContent.parentId).toBe(dbTag._id);
        expect(dbContent.publishDate).toBe(undefined);

        // Assert content and post were logged in the localChanges table
        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(2);
        expect(localChanges[0].doc!._id).toBe(tag._id);
        expect(localChanges[1].doc!._id).toEqual(content._id);
    });
});
