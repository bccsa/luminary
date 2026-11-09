import { describe, it, expect, beforeEach } from "vitest";
import { DocType, type ContentDto } from "luminary-shared";
import {
    rememberContent,
    recentContentBySlug,
    RECENT_CONTENT_LIMIT,
    __resetRecentContent,
} from "./recentContent";

const doc = (n: number, extra: Partial<ContentDto> = {}) =>
    ({
        _id: `c${n}`,
        type: DocType.Content,
        slug: `slug-${n}`,
        updatedTimeUtc: 1,
        text: `body ${n}`,
        fts: ["abc:1"],
        ftsTokenCount: 1,
        ...extra,
    }) as unknown as ContentDto;

describe("recentContent", () => {
    beforeEach(() => __resetRecentContent());

    it("returns a remembered doc by slug with its body but without the search index", () => {
        rememberContent([doc(1)]);
        const found = recentContentBySlug("slug-1");
        expect(found?._id).toBe("c1");
        expect(found?.text).toBe("body 1");
        expect(found).not.toHaveProperty("fts");
        expect(found).not.toHaveProperty("ftsTokenCount");
    });

    it("ignores non-content docs and docs without a slug", () => {
        rememberContent([
            { ...doc(1), type: DocType.Post } as unknown as ContentDto,
            doc(2, { slug: undefined as unknown as string }),
        ]);
        expect(recentContentBySlug("slug-1")).toBeUndefined();
        expect(recentContentBySlug("slug-2")).toBeUndefined();
    });

    it("keeps the latest read of a doc", () => {
        rememberContent([doc(1, { title: "old" })]);
        rememberContent([doc(1, { title: "new" })]);
        expect(recentContentBySlug("slug-1")?.title).toBe("new");
    });

    it("evicts the least recently seen doc past the limit", () => {
        for (let i = 0; i < RECENT_CONTENT_LIMIT; i++) rememberContent([doc(i)]);
        rememberContent([doc(0)]); // seen again, so slug-1 is now the oldest
        rememberContent([doc(RECENT_CONTENT_LIMIT)]);
        expect(recentContentBySlug("slug-0")).toBeDefined();
        expect(recentContentBySlug("slug-1")).toBeUndefined();
        expect(recentContentBySlug(`slug-${RECENT_CONTENT_LIMIT}`)).toBeDefined();
    });
});
