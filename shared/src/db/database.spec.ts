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
    TagType,
    type ContentDto,
    type PostDto,
    type TagDto,
} from "../types";
import { db, getDbVersion, initDatabase } from "../db/database";
import { syncList } from "../api/sync/state";
import { accessMap } from "../permissions/permissions";
import { isConnected } from "../socket/socketio";
import { DateTime } from "luxon";
import { initConfig } from "../config";
import { config } from "../config";

describe("Database", async () => {
    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "[type+postType]",
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

    describe("bulkPut FTS stripping", () => {
        it("strips fts/ftsTokenCount from non-Content docs but keeps them on Content", async () => {
            const userDoc = {
                _id: "user-fts-strip",
                type: DocType.User,
                updatedTimeUtc: 1,
                memberOf: ["group-super-admins"],
                name: "Jane",
                email: "jane@example.com",
                fts: ["jan:1", "ane:1"],
            } as any;
            const contentDoc = {
                ...mockEnglishContentDto,
                _id: "content-fts-keep",
                fts: ["gar:3"],
                ftsTokenCount: 5,
            } as any;

            await db.bulkPut([userDoc, contentDoc]);

            const storedUser = (await db.docs.get("user-fts-strip")) as any;
            const storedContent = (await db.docs.get("content-fts-keep")) as any;

            // Non-Content: fts stripped, other fields preserved.
            expect(storedUser.fts).toBeUndefined();
            expect(storedUser.name).toBe("Jane");
            // Content: index fields retained (offline search needs them).
            expect(storedContent.fts).toEqual(["gar:3"]);
            expect(storedContent.ftsTokenCount).toBe(5);
        });
    });

    it("can generate a V4 UUID", async () => {
        const uuid = db.uuid();
        const verified = uuid.match(
            /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
        );

        expect(verified![0]).toBe(uuid);
    });

    it("can get a document by its id", async () => {
        const post = await db.get<ContentDto>(mockPostDto._id);

        expect(post).toEqual(mockPostDto);
    });

    it("can get documents by their parentId", async () => {
        const postContent = await db.whereParent(mockPostDto._id, DocType.Post);

        expect(postContent.some((c) => c._id == mockEnglishContentDto._id)).toBe(true);
        expect(postContent.some((c) => c._id == mockFrenchContentDto._id)).toBe(true);
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

    it("cant insert a document if localChangesOnly is true", async () => {
        // Use a fresh id (mockPostDto is seeded in beforeEach) so "not in docs" is meaningful.
        const freshDoc = { ...mockPostDto, _id: "post-local-changes-only" } as PostDto;
        await db.upsert({ doc: freshDoc, localChangesOnly: true });

        // The doc is not written to the docs table...
        expect(await db.docs.get(freshDoc._id)).toBeUndefined();
        // ...but the change is queued in localChanges.
        const queued = await db.localChanges.where("docId").equals(freshDoc._id).first();
        expect(queued?.doc).toEqual(freshDoc);
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

    it("can get content documents by tag", async () => {
        const docs = await db.contentWhereTag(mockCategoryDto._id, {
            languageId: mockLanguageDtoEng._id,
        });

        expect(docs).toEqual([mockEnglishContentDto]);
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

        // Check if the local change is queued
        await waitForExpect(async () => {
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
        await db.applyLocalChangeAck({ ack: AckStatus.Accepted }, localChange!);

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
        await db.applyLocalChangeAck(
            {
                ack: AckStatus.Rejected,
                docs: [ackDoc],
            },
            localChange!,
        );

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
        await db.applyLocalChangeAck(
            {
                ack: AckStatus.Rejected,
            },
            localChange!,
        );

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
        afterEach(() => {
            isConnected.value = false;
            accessMap.value = {};
        });

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
            isConnected.value = true;

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
            isConnected.value = true;

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
            isConnected.value = true;

            await waitForExpect(async () => {
                const remainingDocs = await db.docs.toArray();
                expect(remainingDocs).toHaveLength(1);
                expect(remainingDocs.find((doc) => doc._id === "group-public-users")).toBeDefined();
            });
        });

        it("does NOT purge groups when the accessMap transitions to empty (not yet loaded)", async () => {
            // Regression: an empty accessMap is the not-loaded default, not "no access". Purging on
            // it matched every group with an `acl` field and deleted them all before clientConfig
            // populated the real map. The guard in the accessMap watcher must short-circuit instead.
            const group = {
                _id: "group-public-users",
                type: DocType.Group,
                acl: [{ type: DocType.Group, groupId: "g2", permission: [AclPermission.View] }],
                updatedTimeUtc: 0,
            };
            await db.docs.bulkPut([group]);

            // Populated map → watcher runs deleteRevoked; the accessible group is kept.
            accessMap.value = {
                "group-public-users": {
                    [DocType.Group]: { view: true, assign: true },
                },
            };
            isConnected.value = true;
            await waitForExpect(async () => {
                expect(await db.docs.get("group-public-users")).toBeDefined();
            });

            // Transition to an empty map (simulating a not-loaded/cleared state). The watcher
            // fires but the guard must short-circuit, so the group survives.
            accessMap.value = {};
            await new Promise((resolve) => setTimeout(resolve, 50));

            const remainingGroups = await db.docs.where("type").equals(DocType.Group).toArray();
            expect(remainingGroups).toHaveLength(1);
            expect(remainingGroups[0]._id).toBe("group-public-users");
        });
    });

    it("deletes expired documents when not in cms-mode", async () => {
        // Temporarily disable CMS mode — expiryDate is already in the base schema so
        // re-initializing the DB is not needed and would trigger deleteRevoked() side effects.
        config.cms = false;

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

        config.cms = true;
    });

    // Temporary — remove with the recovery block after 2026-09-01 (bccsa/luminary#1730).
    describe("one-time Group syncList recovery", () => {
        afterEach(async () => {
            syncList.value = [];
            await db.setSyncList();
        });

        it("drops the Group syncList block once so purged clients re-fetch groups", async () => {
            localStorage.removeItem("groupSyncListReset_v1");
            syncList.value = [
                { chunkType: "group", memberOf: ["g1"], blockStart: 100, blockEnd: 0, eof: true },
                { chunkType: "post", memberOf: ["g1"], blockStart: 100, blockEnd: 0, eof: true },
            ];
            await db.setSyncList();

            await initDatabase(); // runs the recovery once

            expect(syncList.value.some((e) => e.chunkType === "group")).toBe(false);
            expect(syncList.value.some((e) => e.chunkType === "post")).toBe(true);
            expect(localStorage.getItem("groupSyncListReset_v1")).toBe("1");

            // Idempotent: a fresh Group block seeded afterwards is left untouched on re-init.
            syncList.value = [
                { chunkType: "group", memberOf: ["g1"], blockStart: 100, blockEnd: 0, eof: true },
            ];
            await db.setSyncList();

            await initDatabase();

            expect(syncList.value.some((e) => e.chunkType === "group")).toBe(true);
        });
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
                    updatedTimeUtc: mockEnglishContentDto.updatedTimeUtc + 1,
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
                    updatedTimeUtc: mockEnglishContentDto.updatedTimeUtc + 1,
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
                    updatedTimeUtc: mockEnglishContentDto.updatedTimeUtc + 1,
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
                    updatedTimeUtc: mockEnglishContentDto.updatedTimeUtc + 1,
                } as DeleteCmdDto,
            ]);

            const deletedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedDoc).toBeUndefined();
        });

        it("does not delete a document when receiving a delete request with reason 'permissionChange' and the document's group membership is in the access map", async () => {
            await db.docs.bulkPut([mockEnglishContentDto]);

            accessMap.value = {
                "group-public-content": {
                    [DocType.Post]: { [AclPermission.View]: true },
                    [DocType.Tag]: { [AclPermission.View]: true },
                },
                "group-languages": {
                    [DocType.Language]: { [AclPermission.View]: true },
                },
            };

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
                    updatedTimeUtc: mockEnglishContentDto.updatedTimeUtc + 1,
                } as DeleteCmdDto,
            ]);

            const deletedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(deletedDoc).toBeDefined();

            accessMap.value = {};
        });

        describe("stale deleteCmd timestamp guard", () => {
            const localTime = 2000;
            const olderTime = 1000;
            const equalTime = localTime;

            it("skips deleteCmd with reason 'deleted' when local doc is newer", async () => {
                await db.docs.bulkPut([
                    { ...mockEnglishContentDto, updatedTimeUtc: localTime },
                ]);

                await db.bulkPut([
                    {
                        _id: "delete-cmd-stale-1",
                        type: DocType.DeleteCmd,
                        docId: mockEnglishContentDto._id,
                        deleteReason: "deleted",
                        updatedTimeUtc: olderTime,
                    } as DeleteCmdDto,
                ]);

                const doc = await db.get<ContentDto>(mockEnglishContentDto._id);
                expect(doc).toBeDefined();
                expect(doc?.updatedTimeUtc).toBe(localTime);
            });

            it("skips deleteCmd with reason 'statusChange' when local doc is newer (non-CMS)", async () => {
                config.cms = false;
                await db.docs.bulkPut([
                    { ...mockEnglishContentDto, updatedTimeUtc: localTime },
                ]);

                await db.bulkPut([
                    {
                        _id: "delete-cmd-stale-2",
                        type: DocType.DeleteCmd,
                        docId: mockEnglishContentDto._id,
                        deleteReason: "statusChange",
                        updatedTimeUtc: olderTime,
                    } as DeleteCmdDto,
                ]);

                const doc = await db.get<ContentDto>(mockEnglishContentDto._id);
                expect(doc).toBeDefined();
                expect(doc?.updatedTimeUtc).toBe(localTime);
            });

            it("skips deleteCmd with reason 'permissionChange' when local doc is newer", async () => {
                await db.docs.bulkPut([
                    { ...mockEnglishContentDto, updatedTimeUtc: localTime },
                ]);

                await db.bulkPut([
                    {
                        _id: "delete-cmd-stale-3",
                        type: DocType.DeleteCmd,
                        docType: DocType.Post,
                        docId: mockEnglishContentDto._id,
                        deleteReason: "permissionChange",
                        newMemberOf: ["inaccessible-group"],
                        updatedTimeUtc: olderTime,
                    } as DeleteCmdDto,
                ]);

                const doc = await db.get<ContentDto>(mockEnglishContentDto._id);
                expect(doc).toBeDefined();
                expect(doc?.updatedTimeUtc).toBe(localTime);
            });

            it("skips deleteCmd when timestamps are equal (treats ties as superseded)", async () => {
                await db.docs.bulkPut([
                    { ...mockEnglishContentDto, updatedTimeUtc: localTime },
                ]);

                await db.bulkPut([
                    {
                        _id: "delete-cmd-stale-4",
                        type: DocType.DeleteCmd,
                        docId: mockEnglishContentDto._id,
                        deleteReason: "deleted",
                        updatedTimeUtc: equalTime,
                    } as DeleteCmdDto,
                ]);

                const doc = await db.get<ContentDto>(mockEnglishContentDto._id);
                expect(doc).toBeDefined();
            });

            it("applies deleteCmd when local doc is older than the deleteCmd", async () => {
                await db.docs.bulkPut([
                    { ...mockEnglishContentDto, updatedTimeUtc: olderTime },
                ]);

                await db.bulkPut([
                    {
                        _id: "delete-cmd-fresh-1",
                        type: DocType.DeleteCmd,
                        docId: mockEnglishContentDto._id,
                        deleteReason: "deleted",
                        updatedTimeUtc: localTime,
                    } as DeleteCmdDto,
                ]);

                const doc = await db.get<ContentDto>(mockEnglishContentDto._id);
                expect(doc).toBeUndefined();
            });

            it("applies deleteCmd when local doc is absent (no-op without error)", async () => {
                await db.docs.delete(mockEnglishContentDto._id);

                await db.bulkPut([
                    {
                        _id: "delete-cmd-absent-1",
                        type: DocType.DeleteCmd,
                        docId: mockEnglishContentDto._id,
                        deleteReason: "deleted",
                        updatedTimeUtc: localTime,
                    } as DeleteCmdDto,
                ]);

                const doc = await db.get<ContentDto>(mockEnglishContentDto._id);
                expect(doc).toBeUndefined();
            });

            it("preserves republished content when stale statusChange deleteCmd arrives in a later sync batch (bug repro)", async () => {
                config.cms = false;
                const republishedTime = 3000;
                const staleUnpublishTime = 2000;

                // Catch-up content sync: newer republished content arrives first
                await db.bulkPut([
                    { ...mockEnglishContentDto, updatedTimeUtc: republishedTime },
                ]);

                // Catch-up deleteCmd sync: stale unpublish deleteCmd arrives after
                await db.bulkPut([
                    {
                        _id: "delete-cmd-bug-repro",
                        type: DocType.DeleteCmd,
                        docId: mockEnglishContentDto._id,
                        deleteReason: "statusChange",
                        updatedTimeUtc: staleUnpublishTime,
                    } as DeleteCmdDto,
                ]);

                const doc = await db.get<ContentDto>(mockEnglishContentDto._id);
                expect(doc).toBeDefined();
                expect(doc?.updatedTimeUtc).toBe(republishedTime);
            });
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
