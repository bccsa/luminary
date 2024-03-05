import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { db } from "../baseDatabase";
import {
    mockEnglishContent,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageEng,
    mockPost,
    mockPostDto,
} from "@/tests/mockData";
import { PostRepository } from "./postRepository";
import { DocType, type ContentDto, type PostDto, type Content, type Post } from "@/types";

describe("postRepository", () => {
    afterEach(() => {
        db.localChanges.clear();
        db.docs.clear();
    });

    it("can get all posts", async () => {
        db.docs.bulkPut([
            mockPostDto,
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
        const post = (await db.docs.where("type").equals(DocType.Post).first()) as PostDto;
        expect(post.image).toBe("testImage");

        const content = (await db.docs.where("type").equals(DocType.Content).first()) as ContentDto;
        expect(content.title).toBe("testTitle");
        expect(content.parentId).toBe(post._id);

        // Assert content and post were logged in the localChanges table
        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(2);
        expect(localChanges[0].doc).toEqual(post);
        expect(localChanges[1].doc).toEqual(content);
    });

    it("can update a post", async () => {
        db.docs.bulkPut([
            mockPostDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);
        const repository = new PostRepository();
        const content: Content = {
            ...mockEnglishContent,
            title: "Updated Title",
            publishDate: undefined,
        };
        const post: Post = {
            ...mockPost,
            image: "updatedImage.jpg",
        };

        await repository.update(content, post);

        // Assert content and post were created in local database
        const dbPost = (await db.docs.where("type").equals(DocType.Post).first()) as PostDto;
        expect(dbPost.image).toBe("updatedImage.jpg");

        const dbContent = (await db.docs
            .where("type")
            .equals(DocType.Content)
            .first()) as ContentDto;
        expect(dbContent.title).toBe("Updated Title");
        expect(dbContent.parentId).toBe(dbPost._id);
        expect(dbContent.publishDate).toBe(undefined);

        // Assert content and post were logged in the localChanges table
        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(2);
        expect(localChanges[0].doc!._id).toBe(post._id);
        expect(localChanges[1].doc!._id).toEqual(content._id);
    });
});
