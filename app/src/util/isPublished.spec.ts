// Test for isPublished
import { describe, expect, it } from "vitest";
import { isPublished } from "./isPublished";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { DocType, PublishStatus, type ContentDto } from "luminary-shared";

const mockPreferredLanguages = ["lang-eng", "lang-fra"];

describe("isPublished", () => {
    it("checks is there is content", () => {
        const content: ContentDto = {
            _id: "",
            type: DocType.Content,
            updatedTimeUtc: 0,
            memberOf: [],
            parentTags: [],
            parentId: "",
            language: "",
            status: PublishStatus.Draft,
            title: "",
            slug: "",
        };
        expect(isPublished(content, mockPreferredLanguages)).toBe(false);
    });

    it("checks if the content has a publish date", () => {
        const content: ContentDto = {
            ...mockEnglishContentDto,
            publishDate: undefined,
        };
        expect(isPublished(content, mockPreferredLanguages)).toBe(false);
    });

    it("checks if the content is not published", () => {
        const content: ContentDto = {
            ...mockEnglishContentDto,
            status: PublishStatus.Draft,
        };
        expect(isPublished(content, mockPreferredLanguages)).toBe(false);
    });

    it("checks if the content is expired", () => {
        const content: ContentDto = {
            ...mockEnglishContentDto,
            status: PublishStatus.Published,
            publishDate: Date.now(),
            expiryDate: Date.now() - 1000,
        };

        expect(isPublished(content, mockPreferredLanguages)).toBe(false);
    });

    it("checks if the content is published", () => {
        const content: ContentDto = {
            ...mockEnglishContentDto,
            publishDate: Date.now(),
        };

        expect(isPublished(content, mockPreferredLanguages)).toBe(true);
    });
});
