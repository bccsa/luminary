import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DocType, PublishStatus, type ContentDto, type MangoQuery, type MangoSelector } from "luminary-shared";
import { publishedNowConditions } from "@/util/mangoIsPublished";
import { queryContentLocal } from "./contentStore";

const GLOBAL_KEY = "__SSG_CONTENT_CORPUS__";
// A publishDate comfortably in the past relative to `sessionNow()` (Date.now() at first
// read), so the `publishedNowConditions` `publishDate <= now` clause always matches.
const PAST = 1_000_000;

function doc(over: Partial<ContentDto> & { _id: string }): ContentDto {
    return {
        type: DocType.Content,
        status: PublishStatus.Published,
        publishDate: PAST,
        language: "lang-eng",
        availableTranslations: [],
        ...over,
    } as unknown as ContentDto;
}

function publishedSelector(...extra: MangoSelector[]): MangoQuery {
    return {
        selector: {
            $and: [{ type: DocType.Content }, ...extra, ...publishedNowConditions({ includeScheduled: false })],
        },
    };
}

describe("contentStore — queryContentLocal", () => {
    beforeEach(() => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
        delete process.env.SSG_DISABLE_LOCAL_CONTENT_STORE;
    });
    afterEach(() => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
        delete process.env.SSG_DISABLE_LOCAL_CONTENT_STORE;
    });

    it("returns null when no corpus has been published (caller falls back to queryRemote)", () => {
        expect(queryContentLocal(publishedSelector())).toBeNull();
    });

    it("filters by slug alongside the published clause", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = [
            doc({ _id: "a", slug: "a" }),
            doc({ _id: "b", slug: "b" }),
        ];
        const out = queryContentLocal(publishedSelector({ slug: "a" }));
        expect(out?.map((d) => d._id)).toEqual(["a"]);
    });

    it("filters a parentId $in against parentType", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = [
            doc({ _id: "tag-1", parentId: "p1", parentType: DocType.Tag }),
            doc({ _id: "tag-2", parentId: "p2", parentType: DocType.Tag }),
            doc({ _id: "post-1", parentId: "p1", parentType: DocType.Post }),
        ];
        const out = queryContentLocal(
            publishedSelector({ parentId: { $in: ["p1", "p2"] } }, { parentType: DocType.Tag }),
        );
        expect(out?.map((d) => d._id).sort()).toEqual(["tag-1", "tag-2"]);
    });

    it("sorts publishDate desc with _id asc as the tiebreaker, then applies $limit", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = [
            doc({ _id: "c", publishDate: PAST }),
            doc({ _id: "a", publishDate: PAST }), // ties with c; _id a < c → comes first
            doc({ _id: "b", publishDate: PAST + 1000 }), // newest → first overall
        ];
        const out = queryContentLocal({ ...publishedSelector(), $sort: [{ publishDate: "desc" }], $limit: 2 });
        expect(out?.map((d) => d._id)).toEqual(["b", "a"]);
    });

    it("caps at DEFAULT_REMOTE_QUERY_LIMIT (500) when $limit is omitted", () => {
        const many = Array.from({ length: 501 }, (_, i) => doc({ _id: `d${i}` }));
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = many;
        const out = queryContentLocal(publishedSelector());
        expect(out).toHaveLength(500);
    });

    it("returns an empty array for a provably-empty $in selector", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = [doc({ _id: "a", slug: "a" })];
        const out = queryContentLocal(publishedSelector({ parentId: { $in: [] } }));
        expect(out).toEqual([]);
    });

    it("returns null when SSG_DISABLE_LOCAL_CONTENT_STORE is set, even with a corpus", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = [doc({ _id: "a", slug: "a" })];
        process.env.SSG_DISABLE_LOCAL_CONTENT_STORE = "1";
        expect(queryContentLocal(publishedSelector({ slug: "a" }))).toBeNull();
    });
});