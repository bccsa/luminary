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
import { DocType, type Content, type Post } from "@/types";

describe("postRepository", () => {
    afterEach(() => {
        db.docs.clear();
    });

    it("can find all posts", async () => {
        db.docs.bulkPut([
            mockPostDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageEng,
            mockLanguageFra,
        ]);

        const repository = new PostRepository();

        const result = await repository.findAll();

        expect(result.length).toBe(1);
        expect(result[0]._id).toBe(mockPostDto._id);
        expect(result[0].content[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[0].content[0].language._id).toBe(mockLanguageEng._id);
    });

    it("can create a post", async () => {
        const repository = new PostRepository();
        const createPostDto = {
            image: "testImage",
            language: mockLanguageEng,
            title: "testTitle",
        };

        await repository.create(createPostDto);

        const content = (await db.docs.where("type").equals(DocType.Content).first()) as Content;
        expect(content.title).toBe("testTitle");

        const post = (await db.docs.where("type").equals(DocType.Post).first()) as Post;
        expect(post.image).toBe("testImage");
        expect(post.content[0]).toBe(content._id);

        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(2);
        expect(localChanges[0].docId).toEqual(content._id);
        expect(localChanges[0].doc).toEqual(content);
        expect(localChanges[1].docId).toEqual(post._id);
        expect(localChanges[1].doc).toEqual(post);
    });
});
