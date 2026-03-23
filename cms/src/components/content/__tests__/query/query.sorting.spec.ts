import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { db, DocType, PostType, type ContentDto } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { contentOverviewQuery } from "../../query";

describe("Content query - sorting", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

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

        await waitForExpect(async () => {
            const dbDocs = await db.docs.toArray();
            expect(dbDocs.length).toBeGreaterThan(0);
        });
    });

    afterEach(async () => {
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

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(2);
            expect(res1DocsAsContent[0].title).toBe("Doc 1 Eng");
            expect(res1DocsAsContent[1].title).toBe("Doc 2 Eng");

            const res2DocsAsContent = res2.value?.docs as ContentDto[];
            expect(res2DocsAsContent).toHaveLength(2);
            expect(res2DocsAsContent[0].title).toBe("Doc 1 Fra");
            expect(res2DocsAsContent[1].title).toBe("Doc 2 Fra");
        });
    });

    it("can sort by title in descending order", async () => {
        const res1 = contentOverviewQuery({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "title",
            orderDirection: "desc",
            tagOrPostType: PostType.Blog,
        });

        await waitForExpect(() => {
            const res1DocsAsContent = res1.value?.docs as ContentDto[];
            expect(res1DocsAsContent).toHaveLength(2);
            expect(res1DocsAsContent[0].title).toBe("Doc 2 Eng");
            expect(res1DocsAsContent[1].title).toBe("Doc 1 Eng");
        });
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
});
