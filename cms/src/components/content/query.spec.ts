import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { db, DocType, PostType, type ContentDto } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { contentOverviewQuery } from "./query";

describe("Content query", () => {
    beforeEach(async () => {
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        // seed the fake indexDB with mock data
        const doc1Eng = {
            ...mockData.mockEnglishContentDto,
            _id: "doc1Eng",
            title: "Doc 1 Eng",
            parentId: "doc1",
            updatedTimeUtc: 1,
            publishDate: 1,
            expiryDate: Date.now() + 100000,
            status: "draft",
            parentTags: ["tag1"],
            memberOf: ["group-private-content"],
        } as ContentDto;
        const doc1Fra = {
            ...mockData.mockFrenchContentDto,
            _id: "doc1Fra",
            title: "Doc 1 Fra",
            parentId: "doc1",
            updatedTimeUtc: 1,
            publishDate: 1,
            expiryDate: undefined,
            status: "published",
            parentTags: ["tag1"],
        } as ContentDto;
        const doc1Swa = {
            ...mockData.mockEnglishContentDto,
            _id: "doc1Swa",
            language: "lang-swa",
            title: "Doc 1 Swa",
            parentId: "doc1",
            updatedTimeUtc: 1,
            publishDate: 1,
            expiryDate: Date.now() + 100000,
            status: "draft",
            parentTags: ["tag1"],
        } as ContentDto;
        const doc2Eng = {
            ...mockData.mockEnglishContentDto,
            _id: "doc2Eng",
            title: "Doc 2 Eng",
            parentId: "doc2",
            updatedTimeUtc: 2,
            publishDate: 1,
            expiryDate: 2, // expired
            status: "published",
            parentTags: ["tag2"],
            memberOf: ["group-public-editors"],
        } as ContentDto;
        const doc2Fra = {
            ...mockData.mockFrenchContentDto,
            _id: "doc2Fra",
            title: "Doc 2 Fra",
            parentId: "doc2",
            updatedTimeUtc: 2,
            publishDate: Date.now() + 100000, // scheduled
            expiryDate: undefined,
            status: "published",
            parentTags: ["tag2"],
        } as ContentDto;

        const tag1 = { ...mockData.mockCategoryContentDto, _id: "tag1" } as ContentDto;
        const tag2 = { ...mockData.mockCategoryContentDto, _id: "tag2" } as ContentDto;

        const langEng = mockData.mockLanguageDtoEng;
        const langFra = mockData.mockLanguageDtoFra;
        const langSwa = mockData.mockLanguageDtoSwa;

        await db.docs.bulkPut([
            doc1Eng,
            doc1Fra,
            doc1Swa,
            doc2Eng,
            doc2Fra,
            tag1,
            tag2,
            mockData.mockGroupDtoPrivateContent,
            mockData.mockGroupDtoPublicEditors,
            mockData.mockGroupDtoPublicUsers,
            langEng,
            langFra,
            langSwa,
        ]);

        // Verify database is ready
        await waitForExpect(async () => {
            const dbDocs = await db.docs.toArray();
            expect(dbDocs.length).toBeGreaterThan(0);
        });
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can display the title by preferred language", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "title",
            orderDirection: "asc",
            tagOrPostType: PostType.Blog,
        });

        const res2 = contentOverviewQuery({
            languageId: "lang-fra",
            parentType: DocType.Post,
            orderBy: "title",
            orderDirection: "asc",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(
            () => {
                const res1DocsAsContent = res1.value?.docs as ContentDto[];
                expect(res1DocsAsContent).toHaveLength(2);
                expect(res1DocsAsContent[0].title).toBe("Doc 1 Eng");
                expect(res1DocsAsContent[1].title).toBe("Doc 2 Eng");

                const res2DocsAsContent = res2.value?.docs as ContentDto[];
                expect(res2DocsAsContent).toHaveLength(2);
                expect(res2DocsAsContent[0].title).toBe("Doc 1 Fra");
                expect(res2DocsAsContent[1].title).toBe("Doc 2 Fra");
            },
        );
    });

    it("can sort by title in descending order", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "title",
            orderDirection: "desc",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(
            () => {
                const res1DocsAsContent = res1.value?.docs as ContentDto[];
                expect(res1DocsAsContent).toHaveLength(2);
                expect(res1DocsAsContent[0].title).toBe("Doc 2 Eng");
                expect(res1DocsAsContent[1].title).toBe("Doc 1 Eng");
            },
        );
    });

    it("can sort by updatedTimeUtc", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(2);
            expect(res1DocsAsContent[1].updatedTimeUtc).toBeGreaterThan(
                res1DocsAsContent[0].updatedTimeUtc,
            );
        });
    });

    it("can sort by publishDate", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-fra",
            parentType: DocType.Post,
            orderBy: "publishDate",
            orderDirection: "asc",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(2);
            expect(res1DocsAsContent[1].publishDate).toBeGreaterThan(
                res1DocsAsContent[0].publishDate!,
            );
        });
    });

    it("can sort by expiryDate", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "expiryDate",
            orderDirection: "asc",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(2);
            expect(res1DocsAsContent[1].expiryDate).toBeGreaterThan(
                res1DocsAsContent[0].expiryDate!,
            );
        });
    });

    it("excludes content with undefined sortable fields from the sorted result", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-fra",
            parentType: DocType.Post,
            orderBy: "expiryDate",
            orderDirection: "asc",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            expect(res1.value?.docs).toHaveLength(0);
        });
    });

    it("can display both untranslated and translated content", async () => {
        // The result should return another translation with the same parentId if the content is not available in the preferred language
        const res1 = contentOverviewQuery({
            languageId: "lang-swa",
            parentType: DocType.Post,
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(2);
            const translatedDoc = res1DocsAsContent.find((d) => d.language == "lang-swa");
            const untranslatedDoc = res1DocsAsContent.find((d) => d.language != "lang-swa");
            expect(translatedDoc?.parentId).toBe("doc1");
            expect(untranslatedDoc?.parentId).toBe("doc2");
        });
    });

    it("can apply a filter to include only translated content", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-swa",
            parentType: DocType.Post,
            translationStatus: "translated",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];

            expect(res1DocsAsContent).toHaveLength(1);
            expect(res1DocsAsContent[0]._id).toBe("doc1Swa");
        });
    });

    it("can apply a filter to include only untranslated content", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-swa",
            parentType: DocType.Post,
            translationStatus: "untranslated",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(1);
            expect(res1DocsAsContent[0]._id).not.toBe("doc1Swa");
            expect(res1DocsAsContent[0].parentId).not.toBe("doc1");
        });
    });

    it("can set the result page size and index", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
            pageSize: 1,
            pageIndex: 0,
            tagOrPostType: PostType.Blog,
            publishStatus: "all",
        });

        const res2 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
            pageSize: 1,
            pageIndex: 1,
            tagOrPostType: PostType.Blog,
            publishStatus: "all",
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent?.length).toBeGreaterThan(0);
            expect(res1DocsAsContent).toHaveLength(1);
            expect(res1DocsAsContent[0]._id).toBe("doc1Eng");
            const res2DocsAsContent = res2.value?.docs as ContentDto[];
            expect(res2DocsAsContent?.length).toBeGreaterThan(0);
            expect(res2DocsAsContent).toHaveLength(1);
            expect(res2DocsAsContent[0]._id).toBe("doc2Eng");
        });
    });

    it("can filter by tag", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            tags: ["tag1", "tag2"],
            tagOrPostType: PostType.Blog,
        });

        const res2 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            tags: ["tag1"],
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            expect(res1.value?.docs).toBeDefined();
            expect(res2.value?.docs).toBeDefined();

            const res1DocsAsContent = res1.value?.docs as ContentDto[];

            expect(res1DocsAsContent).toHaveLength(2);
            expect(res1DocsAsContent.some((d) => d._id == "doc1Eng")).toBe(true);
            expect(res1DocsAsContent.some((d) => d._id == "doc2Eng")).toBe(true);

            const res2DocsAsContent = res2.value?.docs as ContentDto[];

            expect(res2DocsAsContent).toHaveLength(1);
            expect(res2DocsAsContent[0].parentTags.includes("tag1")).toBe(true);
        });
    });

    it("can filter by group", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            groups: ["group-private-content", "group-public-editors"],
            tagOrPostType: PostType.Blog,
        });

        const res2 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            groups: ["group-private-content"],
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            expect(res1.value?.docs).toHaveLength(2);
            expect(res1.value?.docs!.some((d) => d._id == "doc1Eng")).toBe(true);
            expect(res1.value?.docs!.some((d) => d._id == "doc2Eng")).toBe(true);

            expect(res2.value?.docs).toHaveLength(1);
            expect(res2.value?.docs![0].memberOf!.includes("group-private-content")).toBe(true);
        });
    });

    it("can search on the title field", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            search: "Doc 1",
            tagOrPostType: PostType.Blog,
        });

        const res2 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            search: "c 2",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(1);
            expect(res1DocsAsContent[0].title).toBe("Doc 1 Eng");

            const res2DocsAsContent = res2.value?.docs as ContentDto[];
            expect(res2DocsAsContent).toHaveLength(1);
            expect(res2DocsAsContent[0].title).toBe("Doc 2 Eng");
        });
    });

    // TODO: This test is flaky due to Dexie live query timing issues
    it.skip("can return the total count of results", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
            pageSize: 1,
            pageIndex: 0,
            count: true,
            tagOrPostType: PostType.Blog,
        });

        const res2 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
            pageSize: 1,
            pageIndex: 1,
            count: true,
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            expect(res1.value).toBeDefined();
            expect(res1.value?.count).toBeDefined();
            expect(res1.value?.count).toBe(2);
            expect(res2.value).toBeDefined();
            expect(res2.value?.count).toBeDefined();
            expect(res2.value?.count).toBe(2);
        });
    });
});
