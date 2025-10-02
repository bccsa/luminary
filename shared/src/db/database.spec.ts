import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect, beforeAll } from "vitest";
import waitForExpect from "wait-for-expect";
import {
    mockCategoryContentDto,
    mockCategoryDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockPostDto,
    mockSwahiliContentDto,
} from "../tests/mockdata";

import {
    AckStatus,
    AclPermission,
    DeleteCmdDto,
    DocType,
    PostType,
    TagType,
    type ContentDto,
    type PostDto,
    type TagDto,
} from "../types";
import { db, getDbVersion, initDatabase } from "../db/database";
import { accessMap } from "../permissions/permissions";
import { DateTime } from "luxon";
import { initConfig } from "../config";
import { config } from "../config";

describe("Database", async () => {
    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "",
            apiUrl: "http://localhost:12345",
        });

        // Initialize the IndexedDB database
        await initDatabase();
    });

    beforeEach(async () => {
        // seed the fake indexDB with mock datas
        await db.docs.bulkPut([mockPostDto]);
        await db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await db.docs.bulkPut([mockCategoryDto, mockCategoryContentDto]);
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can generate a V4 UUID", async () => {
        const uuid = db.uuid();
        const verified = uuid.match(
            /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
        );

        expect(verified![0]).toBe(uuid);
    });

    it("can convert a Dexie query to a Vue ref", async () => {
        const posts = db.toRef(() => db.docs.where("_id").equals(mockPostDto._id).toArray(), []);

        await waitForExpect(() => {
            expect(posts.value).toEqual([mockPostDto]);
        });
    });

    it("can get a document by its id", async () => {
        const post = await db.get<ContentDto>(mockPostDto._id);

        expect(post).toEqual(mockPostDto);
    });

    it("can get a document as a ref by its id", async () => {
        const post = db.getAsRef<ContentDto>(mockPostDto._id);

        await waitForExpect(() => {
            expect(post.value).toEqual(mockPostDto);
        });
    });

    it("returns the initial value of a ref while waiting for the query to complete", async () => {
        const post = db.getAsRef<PostDto>(mockPostDto._id, mockPostDto);

        expect(post.value).toEqual(mockPostDto);
    });

    it("can get all documents of a certain type as a ref", async () => {
        const posts = db.whereTypeAsRef<PostDto[]>(DocType.Post);

        await waitForExpect(() => {
            expect(posts.value).toEqual([mockPostDto]);
        });
    });

    it("can get all documents of a certain type as a ref filtered by tag type", async () => {
        const categories = db.whereTypeAsRef<TagDto[]>(DocType.Tag, undefined, TagType.Category);

        await waitForExpect(() => {
            expect(categories.value).toEqual([mockCategoryDto]);
        });
    });

    it("can get all documents of a certain type as a ref filtered by post type", async () => {
        const posts = db.whereTypeAsRef<PostDto[]>(DocType.Post, undefined, PostType.Blog);

        await waitForExpect(() => {
            expect(posts.value).toEqual([mockPostDto]);
        });
    });

    it("can get documents by their parentId", async () => {
        const postContent = await db.whereParent(mockPostDto._id, DocType.Post);

        expect(postContent.some((c) => c._id == mockEnglishContentDto._id)).toBe(true);
        expect(postContent.some((c) => c._id == mockFrenchContentDto._id)).toBe(true);
    });

    it("can get documents by their parentId as a ref", async () => {
        const postContent = db.whereParentAsRef(mockPostDto._id, DocType.Post);

        await waitForExpect(() => {
            expect(postContent.value.some((c) => c._id == mockEnglishContentDto._id)).toBe(true);
            expect(postContent.value.some((c) => c._id == mockFrenchContentDto._id)).toBe(true);
        });
    });

    it("can get documents by their parentId and parent document type", async () => {
        const content = await db.whereParent([mockCategoryDto._id, mockPostDto._id], DocType.Tag);

        expect(content).toEqual([mockCategoryContentDto]);
    });

    it("can get documents by their parentId and language", async () => {
        const postContent = await db.whereParent(
            mockPostDto._id,
            undefined,
            mockLanguageDtoFra._id,
        );

        expect(postContent).toEqual([mockFrenchContentDto]);
    });

    it("can detect if a local change is queued for a given document ID", async () => {
        const isLocalChange = db.isLocalChangeAsRef(mockPostDto._id);
        await db.upsert({ doc: mockPostDto });

        await waitForExpect(() => {
            expect(isLocalChange.value).toBe(true);
        });
    });

    it("cant insert a document if localChangesOnly is true", async () => {
        const isLocalChange = db.isLocalChangeAsRef(mockPostDto._id);
        await db.upsert({ doc: mockPostDto, localChangesOnly: true });

        await waitForExpect(() => {
            const post = db.getAsRef<PostDto>(mockPostDto._id);
            expect(post.value).toBe(undefined);
            expect(isLocalChange.value).toBe(true);
        });
    });

    it("can get tags by tag type with only the (required) languageId set", async () => {
        const tags = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags).toEqual([mockCategoryDto]);
    });

    it("can get pinned tags by tag type", async () => {
        // Set pinned to true
        await db.docs.update(mockCategoryDto._id, { pinned: 1 });

        const tags = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: true },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags).toEqual([{ ...mockCategoryDto, pinned: 1 }]);

        const tags2 = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: false },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags2).toEqual([]);

        const tags3 = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: undefined },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags3).toEqual([{ ...mockCategoryDto, pinned: 1 }]);

        // Set pinned to false
        await db.docs.update(mockCategoryDto._id, { pinned: 0 });

        const tags4 = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: false },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags4).toEqual([mockCategoryDto]);

        const tags5 = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: undefined },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags5).toEqual([mockCategoryDto]);
    });

    it("can exclude tags that are not top level tags", async () => {
        // Add second category tagged with Category 1
        await db.docs.bulkPut([
            { ...mockCategoryDto, _id: "tag-category2", tags: [mockCategoryDto._id] },
        ]);

        const tags = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { topLevelOnly: true },
            languageId: mockLanguageDtoEng._id,
        });

        // Only the first category should be returned as it is not tagged with other categories
        expect(tags).toEqual([mockCategoryDto]);
    });

    it("can exclude tags that that are not in use", async () => {
        // Add second category wich is not used
        await db.docs.bulkPut([{ ...mockCategoryDto, _id: "tag-category-that-is-unused" }]);
        const tags = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags).toEqual([mockCategoryDto]);
    });

    it("can sort tags by the latest publish date of the content of the posts / tags tagged with the tag", async () => {
        // Category 1
        // Update the publish date of the English content to be 2
        await db.docs.update(mockEnglishContentDto._id, { publishDate: 0 } as any);

        // Add a second post's content document
        await db.docs.bulkPut([
            {
                _id: "post2-content",
                title: "Post 2",
                type: DocType.Content,
                parentId: mockPostDto._id,
                language: mockLanguageDtoEng._id,
                parentTags: [mockCategoryDto._id],
                status: "published",
                publishDate: 0,
            } as ContentDto,
        ]);

        // Category 2
        // Add a second category
        await db.docs.bulkPut([
            { ...mockCategoryDto, _id: "tag-category2" },
            {
                ...mockCategoryContentDto,
                _id: "content-tag-category2",
                parentId: "tag-category2",
            } as ContentDto,
        ]);

        // Create a third content document tagged with Category 2
        await db.docs.bulkPut([
            {
                _id: "post3-content",
                type: DocType.Content,
                parentId: "post-2",
                language: mockLanguageDtoEng._id,
                parentTags: ["tag-category2"],
                status: "published",
                publishDate: 0,
            } as ContentDto,
        ]);

        // Test 1: the order should be Category 1, Category 2
        await db.docs.update(mockEnglishContentDto._id, { publishDate: 0 } as any);
        await db.docs.update("post2-content", { publishDate: 2 } as any);
        await db.docs.update("post3-content", { publishDate: 1 } as any);

        const tags = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags.length).toBe(2);
        expect(tags[0]._id).toBe(mockCategoryDto._id);

        // Test 2: the order should be Category 2, Category 1
        await db.docs.update(mockEnglishContentDto._id, { publishDate: 0 } as any);
        await db.docs.update("post2-content", { publishDate: 1 } as any);
        await db.docs.update("post3-content", { publishDate: 2 } as any);

        const tags2 = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags2.length).toBe(2);
        expect(tags2[0]._id).toBe("tag-category2");
    });

    it("excludes unpublished content per tag type", async () => {
        // Add a second category
        await db.docs.bulkPut([{ ...mockCategoryDto, _id: "tag-category2" }]);

        // Add a second post's content document
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                _id: "post2-content",
                parentId: "draft-content",
                publishDate: 0,
                tags: ["tag-category2"],
                status: "draft",
            } as ContentDto,
        ]);

        const tags = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags.length).toBe(1);
        expect(tags[0]._id).toBe(mockCategoryDto._id); // Only the first category should be returned
    });

    it("excludes content published in the future per tag type", async () => {
        // Add a second category
        await db.docs.bulkPut([{ ...mockCategoryDto, _id: "tag-category2" }]);

        // Add a second post's content document
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                _id: "post2-content",
                parentId: "draft-content",
                publishDate: Date.now() + 10000,
                tags: ["tag-category2"],
                status: "published",
            } as ContentDto,
        ]);

        const tags = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags.length).toBe(1);
        expect(tags[0]._id).toBe(mockCategoryDto._id); // Only the first category should be returned
    });

    it("excludes expired content per tag type", async () => {
        // Add a second category
        await db.docs.bulkPut([{ ...mockCategoryDto, _id: "tag-category2" }]);

        // Add a second post's content document
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                _id: "post2-content",
                parentId: "draft-content",
                expiryDate: Date.now() - 10000,
                tags: ["tag-category2"],
                status: "published",
            } as ContentDto,
        ]);

        const tags = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags.length).toBe(1);
        expect(tags[0]._id).toBe(mockCategoryDto._id); // Only the first category should be returned
    });

    it("can get tags by tag type as a ref", async () => {
        const tags = db.tagsWhereTagTypeAsRef(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        await waitForExpect(() => {
            expect(tags.value).toEqual([mockCategoryDto]);
        });
    });

    it("can get content documents by tag", async () => {
        const docs = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(docs).toEqual([mockEnglishContentDto]);
    });

    it("can get content documents by tag as a ref", async () => {
        const docs = db.contentWhereTagAsRef(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
        });

        await waitForExpect(() => {
            expect(docs.value).toEqual([mockEnglishContentDto]);
        });
    });

    it("can sort and limit content documents by tag", async () => {
        // Set the publish date Post1's content document
        await db.docs.update(mockEnglishContentDto._id, {
            publishDate: 0,
            tags: [mockCategoryDto._id],
            title: "Post 1",
        } as any);

        // Add a second post's content document
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                _id: "post2-content",
                parentId: "post-post2",
                tags: [mockCategoryDto._id],
                status: "published",
                publishDate: 2,
                title: "Post 2",
            } as ContentDto,
        ]);

        // Test 1: Sort ascending
        const res1 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            sortOptions: { sortBy: "publishDate" },
        });

        expect(res1.length).toBe(2);
        expect(res1[0]._id).toBe(mockEnglishContentDto._id);

        // Test 2: Sort descending
        const res2 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            sortOptions: { sortBy: "publishDate", sortOrder: "desc" },
        });

        expect(res2.length).toBe(2);
        expect(res2[0]._id).toBe("post2-content");

        // Test 3: Sort by title
        const res3 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            sortOptions: { sortBy: "title" },
        });

        expect(res3.length).toBe(2);
        expect(res3[0].title).toBe("Post 1");

        // Test 4: Sort by title descending
        const res4 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            sortOptions: { sortBy: "title", sortOrder: "desc" },
        });

        expect(res4.length).toBe(2);
        expect(res4[0].title).toBe("Post 2");

        // Test 5: Limit
        const res5 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            sortOptions: { sortBy: "publishDate" },
            filterOptions: { limit: 1 },
        });

        expect(res5.length).toBe(1);
        expect(res5[0]._id).toBe(mockEnglishContentDto._id);

        // Test 6: Limit with descending sort
        const res6 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            sortOptions: { sortBy: "publishDate", sortOrder: "desc" },
            filterOptions: { limit: 1 },
        });

        expect(res6.length).toBe(1);
        expect(res6[0]._id).toBe("post2-content");
    });

    it("can get content documents by tag filtered by document type", async () => {
        // Add a second tag document tagged with our mockCategoryDto
        const category2 = {
            ...mockCategoryDto,
            _id: "category-2",
            parentTags: [mockCategoryDto._id],
        } as TagDto;
        const category2Content = {
            ...mockCategoryContentDto,
            _id: "category-2-content",
            parentId: "category-2",
            parentTags: [mockCategoryDto._id],
        } as ContentDto;
        await db.docs.bulkPut([category2, category2Content]);

        const docs = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            filterOptions: { docType: DocType.Post },
        });

        // This test should only return the post document's content
        expect(docs).toEqual([mockEnglishContentDto]);

        const docs2 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
            filterOptions: { docType: DocType.Tag },
        });

        // This test should only return the second tag document's content
        expect(docs2).toEqual([category2Content]);

        const docs3 = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
        });

        // This test should return both post and tag documents
        expect(docs3.length).toBe(2);
        expect(docs3.find((d) => d._id == mockEnglishContentDto._id)).toEqual(
            mockEnglishContentDto,
        );
        expect(docs3.find((d) => d._id == category2Content._id)).toEqual(category2Content);
    });

    it("can upsert a document into the database and queue the change to be sent to the API", async () => {
        await db.upsert({ doc: mockPostDto });
        const isLocalChange = db.isLocalChangeAsRef(mockPostDto._id);

        // Check if the local change is queued
        await waitForExpect(async () => {
            expect(isLocalChange.value).toBe(true);

            const localChange = await db.localChanges
                .where("docId")
                .equals(mockPostDto._id)
                .first();
            expect(localChange?.doc).toEqual(mockPostDto);
        });

        // Check if the document is in the database
        const post = await db.get<PostDto>(mockPostDto._id);
        expect(post).toEqual(mockPostDto);
    });

    it("can overwrite a local (offline) change request with a new one", async () => {
        // Queue a local change
        await db.upsert({ doc: mockPostDto });
        const localChange = await db.localChanges.where("docId").equals(mockPostDto._id).toArray();
        expect(localChange.length).toBe(1);

        // Queue a new local change
        const newPost = { ...mockPostDto, title: "New Title" };
        await db.upsert({ doc: newPost, overwriteLocalChanges: true });
        const newLocalChange = await db.localChanges
            .where("docId")
            .equals(mockPostDto._id)
            .toArray();

        // Check that only one local change exists and it is the new one
        expect(newLocalChange.length).toBe(1);
        expect(newLocalChange[0].doc).toEqual(newPost);
    });

    it("can apply a successful change request acknowledgement", async () => {
        // Queue a local change
        await db.upsert({ doc: mockPostDto });
        const localChange = await db.localChanges.where("docId").equals(mockPostDto._id).first();
        expect(localChange).toBeDefined();

        // Apply the local change
        await db.applyLocalChangeAck({ id: localChange!.id!, ack: AckStatus.Accepted });

        // Check if the local change is removed
        const localChangeAfter = await db.localChanges
            .where("docId")
            .equals(mockPostDto._id)
            .first();
        expect(localChangeAfter).toBeUndefined();
    });

    it("can apply a failed change request acknowledgement with a document", async () => {
        // Queue a local change
        await db.upsert({ doc: mockEnglishContentDto });
        const localChange = await db.localChanges
            .where("docId")
            .equals(mockEnglishContentDto._id)
            .first();
        expect(localChange).toBeDefined();

        // Apply the local change
        const ackDoc = { ...mockEnglishContentDto, title: "Old Title 123" };
        await db.applyLocalChangeAck({
            id: localChange!.id!,
            ack: AckStatus.Rejected,
            docs: [ackDoc],
        });

        // Check if the local change is removed
        const localChangeAfter = await db.localChanges
            .where("docId")
            .equals(mockEnglishContentDto._id)
            .first();
        expect(localChangeAfter).toBeUndefined();

        // Check if the document is updated with the acked document
        const post = await db.get<ContentDto>(mockEnglishContentDto._id);
        expect(post).toEqual(ackDoc);
    });

    it("can apply a failed change request acknowledgement without a document", async () => {
        // Queue a local change
        await db.upsert({ doc: mockEnglishContentDto });
        const localChange = await db.localChanges
            .where("docId")
            .equals(mockEnglishContentDto._id)
            .first();
        expect(localChange).toBeDefined();

        // Apply the local change
        await db.applyLocalChangeAck({
            id: localChange!.id!,
            ack: AckStatus.Rejected,
        });

        // Check if the local change is removed
        const localChangeAfter = await db.localChanges
            .where("docId")
            .equals(mockEnglishContentDto._id)
            .first();
        expect(localChangeAfter).toBeUndefined();

        // Check if the document is removed from the database
        const post = await db.get<ContentDto>(mockEnglishContentDto._id);
        expect(post).toBeUndefined();
    });

    it("can purge the local database", async () => {
        // Queue a local change and check if it exists in the docs and localChanges tables
        await db.upsert({ doc: mockPostDto });
        const localChange = await db.localChanges.where("docId").equals(mockPostDto._id).first();
        const doc = await db.get<PostDto>(mockPostDto._id);
        expect(localChange).toBeDefined();
        expect(doc).toEqual(mockPostDto);

        // Purge the local database
        await db.purge();

        // Check that the local changes table is empty
        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(0);

        // Check that the docs table is empty
        const docs = await db.docs.toArray();
        expect(docs.length).toBe(0);
    });

    describe("revoked documents", () => {
        it("removes documents with memberOf field when access to a group is revoked", async () => {
            const docs = [
                {
                    _id: "doc1",
                    type: DocType.Post, // Test Post documents
                    memberOf: ["group-private-users"],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "doc2",
                    type: DocType.Tag, // Test Tag documents
                    memberOf: ["group-private-users"],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "doc3",
                    type: DocType.Content, // Test Content documents
                    memberOf: ["group-private-users"],
                    parentId: "doc1",
                    updatedTimeUtc: 0,
                    parentType: DocType.Post,
                },
                {
                    _id: "doc6",
                    type: DocType.Post,
                    memberOf: ["group-private-users", "group-public-users"], // This document should not be removed as it is also a member of 'group-public-users'
                    updatedTimeUtc: 0,
                },
                {
                    _id: "doc7",
                    type: DocType.Content,
                    memberOf: ["group-private-users", "group-public-users"], // This document should not be removed as it is also a member of 'group-public-users'
                    parentId: "doc6", // This document should not be removed as it's parent is also a member of 'group-public-users'
                    updatedTimeUtc: 0,
                    parentType: DocType.Post,
                },
                {
                    _id: "doc8",
                    type: DocType.Content, // Test orphaned content documents (used by the reference app where Post and Tag documents are not synced to the clients)
                    memberOf: ["group-private-users"],
                    parentId: "doc-non-existent",
                    updatedTimeUtc: 0,
                    parentType: DocType.Post,
                },
            ];
            await db.docs.bulkPut(docs);

            // Simulate receiving an accessMap update that only gives access to 'group-public-users'
            accessMap.value = {
                "group-public-users": {
                    [DocType.Post]: {
                        view: true,
                        assign: true,
                    },
                },
            };

            await waitForExpect(async () => {
                const remainingDocs = await db.docs.toArray();
                expect(remainingDocs).toHaveLength(2);
                expect(remainingDocs.find((doc) => doc._id === "doc6")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "doc7")).toBeDefined();
            });
        });

        it("removes content documents when access to the language document is revoked", async () => {
            const docs = [
                {
                    _id: "doc1",
                    type: DocType.Post, // Parent document - will not be removed as it is a member of 'group-public-users'
                    memberOf: ["group-public-users"],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "doc2",
                    type: DocType.Tag, // Parent document - will not be removed as it is a member of 'group-public-users'
                    memberOf: ["group-public-users"],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "doc3",
                    type: DocType.Content, // Test Content documents for Posts - should be removed as access to the language is revoked
                    parentId: "doc1",
                    updatedTimeUtc: 0,
                    language: "lang1",
                },
                {
                    _id: "doc4",
                    type: DocType.Content, // Test Content documents for Tags - should be removed as access to the language is revoked
                    parentId: "doc2",
                    updatedTimeUtc: 0,
                    language: "lang1",
                },
                {
                    _id: "doc5",
                    type: DocType.Content, // Test Content documents for Posts - should NOT be removed as access to the language is not revoked
                    parentId: "doc1",
                    updatedTimeUtc: 0,
                    language: "lang2",
                },
                {
                    _id: "lang1",
                    type: DocType.Language, // Test Language document - will be removed as it is not a member of 'group-public-users'
                    memberOf: ["group-private-users"],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "lang2",
                    type: DocType.Language, // Test Language document - will not be removed as it is a member of 'group-public-users'
                    memberOf: ["group-public-users"],
                    updatedTimeUtc: 0,
                },
            ];
            await db.docs.bulkPut(docs);

            // Simulate receiving an accessMap update that only gives access to 'group-public-users'
            accessMap.value = {
                "group-public-users": {
                    [DocType.Post]: {
                        view: true,
                        assign: true,
                    },
                    [DocType.Tag]: {
                        view: true,
                    },
                    [DocType.Language]: {
                        view: true,
                    },
                },
            };

            await waitForExpect(async () => {
                const remainingDocs = await db.docs.toArray();
                expect(remainingDocs).toHaveLength(4);
                expect(remainingDocs.find((doc) => doc._id === "doc1")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "doc2")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "doc5")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "lang2")).toBeDefined();
            });
        });

        it("removes documents with acl field when access to a group is revoked", async () => {
            const docs = [
                {
                    _id: "group-private-users", // Should be removed as it is not 'group-public-users'
                    type: DocType.Group,
                    acl: [
                        {
                            type: DocType.Group,
                            groupId: "g1",
                            permission: [AclPermission.View],
                        },
                    ],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "group-public-users", // Should be kept as it is 'group-public-users'
                    type: DocType.Group,
                    acl: [
                        {
                            type: DocType.Group,
                            groupId: "g2",
                            permission: [AclPermission.View],
                        },
                    ],
                    updatedTimeUtc: 0,
                },
            ];
            await db.docs.bulkPut(docs);

            // Simulate receiving an accessMap update that only gives access to 'group-public-users'
            accessMap.value = {
                "group-public-users": {
                    [DocType.Group]: {
                        view: true,
                        assign: true,
                    },
                },
            };

            await waitForExpect(async () => {
                const remainingDocs = await db.docs.toArray();
                expect(remainingDocs).toHaveLength(1);
                expect(remainingDocs.find((doc) => doc._id === "group-public-users")).toBeDefined();
            });
        });

        it("clears the query cache when documents are deleted due to access revocation", async () => {
            const docs = [
                {
                    _id: "doc1",
                    type: DocType.Post, // Test Post documents
                    memberOf: ["group-private-users"],
                    updatedTimeUtc: 0,
                },
            ];
            await db.docs.bulkPut(docs);

            // Manually add a query to the cache
            await db.setQueryCache("test-query", [
                { ...mockEnglishContentDto, memberOf: ["group-private-content"] },
            ]);

            // Simulate receiving an accessMap update that only gives access to 'group-public-content'
            accessMap.value = {
                "group-public-content": {
                    [DocType.Post]: {
                        view: true,
                    },
                },
            };

            await waitForExpect(async () => {
                const queryCache = await db.queryCache.toArray();
                expect(queryCache.length).toBe(0);
            });
        });
    });

    it("deletes expired documents when not in cms-mode", async () => {
        initConfig({
            cms: false,
            docsIndex: "parentId, language, expiryDate, [type+docType]",
            apiUrl: "http://localhost:12345",
        });
        await initDatabase();

        const now = DateTime.now();
        const expiredDate = now.minus({ days: 5 }).toMillis();
        const futureExpiredDate = now.plus({ days: 5 }).toMillis();

        const docs: ContentDto[] = [
            {
                ...mockEnglishContentDto,
                expiryDate: expiredDate,
            },
            {
                ...mockFrenchContentDto,
                expiryDate: expiredDate,
            },
            {
                ...mockSwahiliContentDto,
                expiryDate: futureExpiredDate,
            },
            {
                ...mockEnglishContentDto,
                expiryDate: futureExpiredDate,
            },
        ];

        await db.docs.clear();
        await db.docs.bulkPut(docs);

        await (db as any).deleteExpired();

        const remainingDocs = await db.docs.toArray();
        expect(remainingDocs).toHaveLength(2);
    });

    it("upgrade indexdb version by changing the docs index", async () => {
        const _v1 = await getDbVersion();

        // update db index schema
        initConfig({
            cms: false,
            docsIndex: "[type+docType+language]",
            apiUrl: "http://localhost:12345",
        });
        await initDatabase();

        const _v2 = await getDbVersion();

        expect(_v1).toBeLessThan(_v2);
    });

    describe("document deletion", () => {
        it("can delete a document when receiving a delete request with reason 'deleted'", async () => {
            await db.docs.bulkPut([mockEnglishContentDto]);

            const addedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(addedDoc).toBeDefined();

            await db.bulkPut([
                {
                    _id: "delete-cmd-1",
                    type: DocType.DeleteCmd,
                    docId: mockEnglishContentDto._id,
                    deleteReason: "deleted",
                } as DeleteCmdDto,
            ]);

            const deletedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedDoc).toBeUndefined();
        });

        it("can delete a document when receiving a delete request with reason 'statusChange' in non-CMS mode", async () => {
            await db.docs.bulkPut([mockEnglishContentDto]);
            config.cms = false;

            const addedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(addedDoc).toBeDefined();

            await db.bulkPut([
                {
                    _id: "delete-cmd-1",
                    type: DocType.DeleteCmd,
                    docId: mockEnglishContentDto._id,
                    deleteReason: "statusChange",
                } as DeleteCmdDto,
            ]);

            const deletedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedDoc).toBeUndefined();
        });

        it("does not delete a document when receiving a delete request with reason 'statusChange' in CMS mode", async () => {
            await db.docs.bulkPut([mockEnglishContentDto]);
            config.cms = true;

            const addedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(addedDoc).toBeDefined();

            await db.bulkPut([
                {
                    _id: "delete-cmd-1",
                    type: DocType.DeleteCmd,
                    docId: mockEnglishContentDto._id,
                    deleteReason: "statusChange",
                } as DeleteCmdDto,
            ]);

            const deletedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedDoc).toBeDefined();
        });

        it("deletes a document when receiving a delete request with reason 'permissionChange' and the document's group membership is not in the access map", async () => {
            await db.docs.bulkPut([mockEnglishContentDto]);

            const addedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(addedDoc).toBeDefined();

            await db.bulkPut([
                {
                    _id: "delete-cmd-1",
                    type: DocType.DeleteCmd,
                    docId: mockEnglishContentDto._id,
                    deleteReason: "permissionChange",
                    newMemberOf: ["inaccessible-group"],
                } as DeleteCmdDto,
            ]);

            const deletedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedDoc).toBeUndefined();
        });

        it("does not delete a document when receiving a delete request with reason 'permissionChange' and the document's group membership is in the access map", async () => {
            await db.docs.bulkPut([mockEnglishContentDto]);

            const addedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(addedDoc).toBeDefined();

            await db.bulkPut([
                {
                    _id: "delete-cmd-1",
                    type: DocType.DeleteCmd,
                    docType: DocType.Post,
                    docId: mockEnglishContentDto._id,
                    deleteReason: "permissionChange",
                    newMemberOf: ["group-public-content"],
                } as DeleteCmdDto,
            ]);

            const deletedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedDoc).toBeDefined();
        });

        it("can delete related content documents when a parent document is deleted locally through marking a document with deleteReq: 1", async () => {
            await db.docs.bulkPut([mockPostDto, mockEnglishContentDto, mockFrenchContentDto]);

            const addedDoc = await db.get<ContentDto>(mockPostDto._id);
            expect(addedDoc).toBeDefined();

            const addedContent1 = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(addedContent1).toBeDefined();

            const addedContent2 = await db.get<ContentDto>(mockFrenchContentDto._id);
            expect(addedContent2).toBeDefined();

            await db.upsert({ doc: { ...mockPostDto, deleteReq: 1 } });

            const deletedDoc = await db.get<PostDto>(mockPostDto._id);
            expect(deletedDoc).toBeUndefined();

            const deletedContent1 = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedContent1).toBeUndefined();

            const deletedContent2 = await db.get<ContentDto>(mockFrenchContentDto._id);
            expect(deletedContent2).toBeUndefined();
        });
    });
});
