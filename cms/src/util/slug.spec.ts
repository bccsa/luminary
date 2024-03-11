import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { Slug } from "./slug";
import { db } from "@/db/baseDatabase";
import { mockEnglishContentDto } from "@/tests/mockData";
import type { ContentDto } from "@/types";

describe("Slug", () => {
    afterEach(() => {
        db.docs.clear();
    });

    it("should generate a slug from a title", async () => {
        const title = "Sample Title";

        const generatedSlug = await Slug.generate(title, "fake-id");

        expect(generatedSlug).toBe("sample-title");
    });

    it("should append a number for a duplicate title", async () => {
        db.docs.put({ ...mockEnglishContentDto, slug: "sample-title" } as ContentDto);
        const title = "Sample Title";

        const generatedSlug = await Slug.generate(title, "different-id");

        expect(generatedSlug).toMatch(/sample-title-[0-9]([0-9])*/);
    });

    it("should not make the title for the same content unique", async () => {
        db.docs.put({ ...mockEnglishContentDto, slug: "sample-title" } as ContentDto);
        const title = "Sample Title";

        const generatedSlug = await Slug.generate(title, mockEnglishContentDto._id);

        expect(generatedSlug).toBe("sample-title");
    });
});
