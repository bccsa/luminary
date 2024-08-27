import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { db, DocType, type ContentDto } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { contentOverviewQueryAsRef } from "./query";

describe("Content query", () => {
    beforeEach(async () => {
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
            langEng,
            langFra,
            langSwa,
        ]);
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("can display the title by preferred language", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "title",
            orderDirection: "asc",
        });

        const res2 = contentOverviewQueryAsRef({
            languageId: "lang-fra",
            parentType: DocType.Post,
            orderBy: "title",
            orderDirection: "asc",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(2);
            expect(res1.value[0].title).toBe("Doc 1 Eng");
            expect(res1.value[1].title).toBe("Doc 2 Eng");

            expect(res2.value).toHaveLength(2);
            expect(res2.value[0].title).toBe("Doc 1 Fra");
            expect(res2.value[1].title).toBe("Doc 2 Fra");
        });
    });

    it("can sort by title in descending order", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "title",
            orderDirection: "desc",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(2);
            expect(res1.value[0].title).toBe("Doc 2 Eng");
            expect(res1.value[1].title).toBe("Doc 1 Eng");
        });
    });

    it("can sort by updatedTimeUtc", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(2);
            expect(res1.value[1].updatedTimeUtc).toBeGreaterThan(res1.value[0].updatedTimeUtc);
        });
    });

    it("can sort by publishDate", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-fra",
            parentType: DocType.Post,
            orderBy: "publishDate",
            orderDirection: "asc",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(2);
            expect(res1.value[1].publishDate).toBeGreaterThan(res1.value[0].publishDate!);
        });
    });

    it("can sort by expiryDate", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "expiryDate",
            orderDirection: "asc",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(2);
            expect(res1.value[1].expiryDate).toBeGreaterThan(res1.value[0].expiryDate!);
        });
    });

    it("excludes content with undefined sortable fields from the sorted result", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-fra",
            parentType: DocType.Post,
            orderBy: "expiryDate",
            orderDirection: "asc",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(0);
        });
    });

    it("can display both untranslated and translated content", async () => {
        // The result should return another translation with the same parentId if the content is not available in the preferred language
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-swa",
            parentType: DocType.Post,
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(2);
            const translatedDoc = res1.value.find((d) => d.language == "lang-swa");
            const untranslatedDoc = res1.value.find((d) => d.language != "lang-swa");
            expect(translatedDoc?.parentId).toBe("doc1");
            expect(untranslatedDoc?.parentId).toBe("doc2");
        });
    });

    it("can apply a filter to include only translated content", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-swa",
            parentType: DocType.Post,
            translationStatus: "translated",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(1);
            expect(res1.value[0]._id).toBe("doc1Swa");
        });
    });

    it("can apply a filter to include only untranslated content", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-swa",
            parentType: DocType.Post,
            translationStatus: "untranslated",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(1);
            expect(res1.value[0]._id).not.toBe("doc1Swa");
            expect(res1.value[0].parentId).not.toBe("doc1");
        });
    });

    it("can set the result page size and index", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
            pageSize: 1,
            pageIndex: 0,
        });

        const res2 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            orderBy: "updatedTimeUtc",
            orderDirection: "asc",
            pageSize: 1,
            pageIndex: 1,
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(1);
            expect(res1.value[0]._id).toBe("doc1Eng");
            expect(res2.value).toHaveLength(1);
            expect(res2.value[0]._id).toBe("doc2Eng");
        });
    });

    it("can filter by tag", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            tags: ["tag1", "tag2"],
        });

        const res2 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            tags: ["tag1"],
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(2);
            expect(res1.value.some((d) => d._id == "doc1Eng")).toBe(true);
            expect(res1.value.some((d) => d._id == "doc2Eng")).toBe(true);

            expect(res2.value).toHaveLength(1);
            expect(res2.value[0].parentTags.includes("tag1")).toBe(true);
        });
    });

    it("can search on the title field", async () => {
        const res1 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            search: "Doc 1",
        });

        const res2 = contentOverviewQueryAsRef({
            languageId: "lang-eng",
            parentType: DocType.Post,
            search: "c 2",
        });

        await waitForExpect(() => {
            expect(res1.value).toHaveLength(1);
            expect(res1.value[0].title).toBe("Doc 1 Eng");

            expect(res2.value).toHaveLength(1);
            expect(res2.value[0].title).toBe("Doc 2 Eng");
        });
    });
});
