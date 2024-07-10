import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
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
} from "../tests/mockData";

import {
    AckStatus,
    AclPermission,
    DocType,
    TagType,
    type ContentDto,
    type PostDto,
    type TagDto,
} from "../types";
import { db } from "../db/database";
import { accessMap } from "../permissions/permissions";

describe("baseDatabase.ts", () => {
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
        const posts = db.whereTypeAsRef<TagDto[]>(DocType.Tag, undefined, TagType.Category);

        await waitForExpect(() => {
            expect(posts.value).toEqual([mockCategoryDto]);
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
        await db.upsert(mockPostDto);

        await waitForExpect(() => {
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
        await db.docs.update(mockCategoryDto._id, { pinned: true });

        const tags = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: true },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags).toEqual([{ ...mockCategoryDto, pinned: true }]);

        const tags2 = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: false },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags2).toEqual([]);

        const tags3 = await db.tagsWhereTagType(TagType.Category, {
            filterOptions: { pinned: undefined },
            languageId: mockLanguageDtoEng._id,
        });
        expect(tags3).toEqual([{ ...mockCategoryDto, pinned: true }]);

        // Set pinned to false
        await db.docs.update(mockCategoryDto._id, { pinned: false });

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
        await db.docs.update(mockEnglishContentDto._id, { publishDate: 0 });

        // Add a second post's content document
        await db.docs.bulkPut([
            {
                _id: "post2-content",
                title: "Post 2",
                type: DocType.Content,
                parentId: mockPostDto._id,
                language: mockLanguageDtoEng._id,
                tags: [mockCategoryDto._id],
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
                tags: ["tag-category2"],
                status: "published",
                publishDate: 0,
            } as ContentDto,
        ]);

        // Test 1: the order should be Category 1, Category 2
        await db.docs.update(mockEnglishContentDto._id, { publishDate: 0 });
        await db.docs.update("post2-content", { publishDate: 2 });
        await db.docs.update("post3-content", { publishDate: 1 });

        const tags = await db.tagsWhereTagType(TagType.Category, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(tags.length).toBe(2);
        expect(tags[0]._id).toBe(mockCategoryDto._id);

        // Test 2: the order should be Category 2, Category 1
        await db.docs.update(mockEnglishContentDto._id, { publishDate: 0 });
        await db.docs.update("post2-content", { publishDate: 1 });
        await db.docs.update("post3-content", { publishDate: 2 });

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
        });

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

    it("can upsert a document into the database and queue the change to be sent to the API", async () => {
        await db.upsert(mockPostDto);
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

    it("can apply a successful change request acknowledgement", async () => {
        // Queue a local change
        await db.upsert(mockPostDto);
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
        await db.upsert(mockEnglishContentDto);
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
            doc: ackDoc,
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
        await db.upsert(mockEnglishContentDto);
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
        await db.upsert(mockPostDto);
        db.syncVersion = 123;
        const localChange = await db.localChanges.where("docId").equals(mockPostDto._id).first();
        const doc = await db.get<PostDto>(mockPostDto._id);
        expect(localChange).toBeDefined();
        expect(doc).toEqual(mockPostDto);
        expect(localStorage.getItem("syncVersion")).toBe("123");

        // Purge the local database
        await db.purge();

        // Check that the local changes table is empty
        const localChanges = await db.localChanges.toArray();
        expect(localChanges.length).toBe(0);

        // Check that the docs table is empty
        const docs = await db.docs.toArray();
        expect(docs.length).toBe(0);

        // Check that the sync version is reset
        expect(localStorage.getItem("syncVersion")).toBe("0");
        expect(db.syncVersion).toBe(0);
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
                    parentId: "doc1",
                    updatedTimeUtc: 0,
                },
                {
                    _id: "doc4",
                    type: DocType.Change, // Test change documents of type Post
                    memberOf: ["group-private-users"],
                    docType: DocType.Post,
                    updatedTimeUtc: 0,
                },
                {
                    _id: "doc5",
                    type: DocType.Change, // Test change documents of type Content
                    docType: DocType.Content,
                    parentId: "doc2",
                    updatedTimeUtc: 0,
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
                    parentId: "doc6", // This document should not be removed as it's parent is also a member of 'group-public-users'
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
                    _id: "doc6",
                    type: DocType.Change, // Test content Change docs - should be removed as access to the language is revoked
                    parentId: "doc1",
                    updatedTimeUtc: 0,
                    language: "lang1",
                },
                {
                    _id: "doc7",
                    type: DocType.Change, // Test content Change docs - should NOT be removed as access to the language NOT revoked
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
                expect(remainingDocs).toHaveLength(5);
                expect(remainingDocs.find((doc) => doc._id === "doc1")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "doc2")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "doc5")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "doc7")).toBeDefined();
                expect(remainingDocs.find((doc) => doc._id === "lang2")).toBeDefined();
            });
        });

        it("removes documents with acl field when access to a group is revoked", async () => {
            const docs = [
                {
                    _id: "group1", // Should be removed as it is not a member of 'group-public-users'
                    type: DocType.Group,
                    acl: [
                        {
                            type: DocType.Group,
                            groupId: "group-private-users",
                            permission: [AclPermission.View],
                        },
                    ],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "group2", // Should be kept as it is a member of 'group-public-users'
                    type: DocType.Group,
                    acl: [
                        {
                            type: DocType.Group,
                            groupId: "group-public-users",
                            permission: [AclPermission.View],
                        },
                    ],
                    updatedTimeUtc: 0,
                },
                {
                    _id: "group3", // Should be removed as it is not a member of 'group-public-users'
                    type: DocType.Change,
                    docType: DocType.Group,
                    acl: [
                        {
                            type: DocType.Group,
                            groupId: "group-private-users",
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
                expect(remainingDocs.find((doc) => doc._id === "group2")).toBeDefined();
            });
        });
    });
});
