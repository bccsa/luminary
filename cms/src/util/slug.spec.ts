import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { Slug } from "./slug";
import { db, type ContentDto } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockdata";

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

    it("should not make the slug for the same document unique", async () => {
        db.docs.put({ ...mockEnglishContentDto, slug: "sample-title" } as ContentDto);
        const title = "Sample Title";

        const generatedSlug = await Slug.generate(title, mockEnglishContentDto._id);

        expect(generatedSlug).toBe("sample-title");
    });

    describe("generateNonUnique - bug prevention tests", () => {
        it("converts basic text to slug", () => {
            expect(Slug.generateNonUnique("Hello World")).toBe("hello-world");
        });

        it("handles special characters", () => {
            expect(Slug.generateNonUnique("Hello & World!")).toBe("hello-and-world");
        });

        it("removes trailing dashes", () => {
            expect(Slug.generateNonUnique("Hello World-")).toBe("hello-world");
        });

        it("removes leading dashes", () => {
            expect(Slug.generateNonUnique("-Hello World")).toBe("hello-world");
        });

        it("removes multiple trailing dashes", () => {
            expect(Slug.generateNonUnique("Hello World---")).toBe("hello-world");
        });

        it("removes multiple leading dashes", () => {
            expect(Slug.generateNonUnique("---Hello World")).toBe("hello-world");
        });

        it("consolidates multiple consecutive dashes", () => {
            expect(Slug.generateNonUnique("Hello---World")).toBe("hello-world");
        });

        it("handles dash followed by space correctly (original bug)", () => {
            expect(Slug.generateNonUnique("Hello- World")).toBe("hello-world");
        });

        it("handles multiple spaces", () => {
            expect(Slug.generateNonUnique("Hello    World")).toBe("hello-world");
        });

        it("handles empty string", () => {
            expect(Slug.generateNonUnique("")).toBe("");
        });

        it("handles string with only dashes", () => {
            expect(Slug.generateNonUnique("---")).toBe("");
        });

        it("handles string with only spaces", () => {
            expect(Slug.generateNonUnique("   ")).toBe("");
        });

        it("handles Unicode characters", () => {
            expect(Slug.generateNonUnique("Héllo Wörld")).toBe("hllo-wrld");
        });

        it("handles numbers correctly", () => {
            expect(Slug.generateNonUnique("Hello World 123")).toBe("hello-world-123");
        });

        it("handles mixed case correctly", () => {
            expect(Slug.generateNonUnique("HeLLo WoRLd")).toBe("hello-world");
        });

        it("preserves valid slug format", () => {
            expect(Slug.generateNonUnique("hello-world")).toBe("hello-world");
        });

        it("handles edge case with dash-space-dash pattern", () => {
            expect(Slug.generateNonUnique("test- -more")).toBe("test-more");
        });

        it("handles underscores", () => {
            expect(Slug.generateNonUnique("hello_world")).toBe("hello-world");
        });

        it("handles periods and other punctuation", () => {
            expect(Slug.generateNonUnique("hello.world,test")).toBe("helloworldtest");
        });

        it("handles non standard input", () => {
            // These are the specific patterns that caused issues
            expect(Slug.generateNonUnique("hello-")).toBe("hello");
            expect(Slug.generateNonUnique("hello- ")).toBe("hello");
            expect(Slug.generateNonUnique("hello--")).toBe("hello");
            expect(Slug.generateNonUnique("hello- world")).toBe("hello-world");
            expect(Slug.generateNonUnique("test-slug-with-trailing-dash-")).toBe(
                "test-slug-with-trailing-dash",
            );
        });

        it("removes trailing dashes followed by spaces", () => {
            // User types "hello-" then presses space
            // This simulates the exact sequence: dash followed by space
            expect(Slug.generateNonUnique("hello- ")).toBe("hello");
        });

        it("handles multiple dash-space combinations", () => {
            expect(Slug.generateNonUnique("hello- world- test")).toBe("hello-world-test");
        });

        it("handles very long strings without breaking", () => {
            const longString = "a".repeat(100) + "-" + "b".repeat(100);
            const result = Slug.generateNonUnique(longString);
            expect(result).toBe("a".repeat(100) + "-" + "b".repeat(100));
        });

        it("handles all whitespace characters", () => {
            expect(Slug.generateNonUnique("hello\tworld\ntest")).toBe("hello-world-test");
        });
    });
});
