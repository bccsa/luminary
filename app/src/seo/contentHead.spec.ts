import { describe, it, expect } from "vitest";
import { primaryArticleImage } from "./contentHead";
import { DocType, PostType, PublishStatus, type ContentDto } from "luminary-shared";

function contentWithWidths(widths: number[]): ContentDto {
    return {
        _id: "content-1",
        type: DocType.Content,
        updatedTimeUtc: 0,
        parentId: "post-1",
        parentType: DocType.Post,
        parentPostType: PostType.Blog,
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "post-1",
        title: "Title",
        summary: "",
        author: "",
        text: "",
        parentTags: [],
        parentImageData: {
            fileCollections: [
                {
                    aspectRatio: 1.5,
                    imageFiles: widths.map((width) => ({
                        width,
                        height: Math.round(width / 1.5),
                        filename: `${width}.webp`,
                    })),
                },
            ],
        },
    } as unknown as ContentDto;
}

describe("primaryArticleImage", () => {
    it("returns undefined without image data or a bucket URL", () => {
        expect(primaryArticleImage(undefined, "https://cdn.example.com")).toBeUndefined();
        expect(primaryArticleImage(contentWithWidths([1280]), undefined)).toBeUndefined();
    });

    it("picks the size closest to the OG/Twitter target width, not the largest", () => {
        // Real processed presets: [180, 360, 640, 1280, 2560] — 1280 is closest to 1200.
        const image = primaryArticleImage(
            contentWithWidths([180, 360, 640, 1280, 2560]),
            "https://cdn.example.com/bucket",
        );
        expect(image?.width).toBe(1280);
        expect(image?.url).toBe("https://cdn.example.com/bucket/1280.webp");
    });

    it("falls back to the largest available size when nothing reaches the target width", () => {
        const image = primaryArticleImage(contentWithWidths([180, 360]), "https://cdn.example.com");
        expect(image?.width).toBe(360);
    });

    it("picks the only available size when there's just one", () => {
        const image = primaryArticleImage(contentWithWidths([640]), "https://cdn.example.com");
        expect(image?.width).toBe(640);
    });

    it("strips a trailing slash from the bucket base URL", () => {
        const image = primaryArticleImage(contentWithWidths([1280]), "https://cdn.example.com/");
        expect(image?.url).toBe("https://cdn.example.com/1280.webp");
    });
});
