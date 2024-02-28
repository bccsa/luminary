import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { db } from "../baseDatabase";
import {
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageEng,
    mockPostDto,
} from "@/tests/mockData";
import { PostRepository } from "./postRepository";
import { DocType, type ContentDto, type PostDto } from "@/types";

describe("postRepository", () => {
    afterEach(() => {
        db.docs.clear();
    });

    it("can find all posts", async () => {
        db.docs.bulkPut([
            mockPostDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);

        const repository = new PostRepository();

        const result = await repository.findAll();

        expect(result.length).toBe(1);
        expect(result[0]._id).toBe(mockPostDto._id);
        expect(result[0].content[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[0].content[0].language._id).toBe(mockLanguageDtoEng._id);
    });

    it("can create a post", async () => {
        const repository = new PostRepository();
        const createPostDto = {
            image: "testImage",
            language: mockLanguageEng,
            title: "testTitle",
        };

        await repository.create(createPostDto);

        // Assert content and post were created in local database
        const content = (await db.docs.where("type").equals(DocType.Content).first()) as ContentDto;
        expect(content.title).toBe("testTitle");

        const post = (await db.docs.where("type").equals(DocType.Post).first()) as PostDto;
        expect(post.image).toBe("testImage");
        expect(post.content[0]).toBe(content._id);

        // Assert content and post were logged in the localChanges table
        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(2);
        expect(localChanges[0].doc).toEqual(post);
        expect(localChanges[1].doc).toEqual(content);
    });
});
