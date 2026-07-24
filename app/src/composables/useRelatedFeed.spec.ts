import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";
import waitForExpect from "wait-for-expect";
import { db, DocType, PublishStatus, type ContentDto } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useMoreLikeThis } from "@/composables/useMoreLikeThis";
import { useRecommendations } from "@/composables/useRecommendations";
import { useRelatedFeed, type UseRelatedFeedOptions } from "./useRelatedFeed";

vi.mock("@/composables/useMoreLikeThis", () => ({
    useMoreLikeThis: vi.fn(),
}));
vi.mock("@/composables/useRecommendations", () => ({
    useRecommendations: vi.fn(),
}));

function makeContent(id: string, overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        _id: id,
        type: DocType.Content,
        parentType: DocType.Post,
        parentId: `post-${id}`,
        updatedTimeUtc: Date.now(),
        memberOf: ["group-public-content"],
        parentTags: [],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: id,
        title: id,
        publishDate: Date.now() - 1000,
        ...overrides,
    } as ContentDto;
}

function makeTag(parentId: string, parentTaggedDocs?: (string | null)[]): ContentDto {
    return makeContent(`content-${parentId}`, {
        parentType: DocType.Tag,
        parentId,
        title: parentId,
        parentTaggedDocs: parentTaggedDocs as string[] | undefined,
    });
}

function start(
    selectedContent: ContentDto,
    topicTags: ContentDto[],
    options?: UseRelatedFeedOptions,
) {
    const scope = effectScope();
    const result = scope.run(() => useRelatedFeed(() => selectedContent, () => topicTags, options));
    if (!result) throw new Error("useRelatedFeed did not initialize inside its effect scope");
    return { result, scope };
}

describe("useRelatedFeed", () => {
    const scopes: ReturnType<typeof effectScope>[] = [];
    let previousLanguageIds: string[];

    beforeEach(() => {
        previousLanguageIds = [...appLanguageIdsAsRef.value];
        appLanguageIdsAsRef.value = ["lang-eng"];
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => []),
            ready: computed(() => true),
        });
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => []),
            hasTags: computed(() => false),
            topTagIds: computed(() => []),
            ready: computed(() => true),
        });
    });

    afterEach(async () => {
        scopes.splice(0).forEach((scope) => scope.stop());
        vi.clearAllMocks();
        appLanguageIdsAsRef.value = previousLanguageIds;
        await db.docs.clear();
    });

    function run(
        selectedContent: ContentDto,
        topicTags: ContentDto[],
        options?: UseRelatedFeedOptions,
    ) {
        const started = start(selectedContent, topicTags, options);
        scopes.push(started.scope);
        return started.result;
    }

    it("exposes ready only once every leg (series, author, affinity, and the topical/FTS leg) has resolved", async () => {
        const selected = makeContent("selected");
        const similarReady = ref(false);
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => []),
            ready: similarReady,
        });

        const result = run(selected, []);

        expect(result.ready.value).toBe(false);
        similarReady.value = true;
        await waitForExpect(() => expect(result.ready.value).toBe(true));
    });

    it("pins series neighbours first, ahead of similar/author/affinity content", async () => {
        const selected = makeContent("selected-b", {
            parentId: "post-b",
            parentTags: ["tag-series"],
            publishDate: 2,
        });
        await db.docs.bulkPut([
            makeContent("series-a", { parentId: "post-a", publishDate: 1 }),
            selected,
            makeContent("series-c", { parentId: "post-c", publishDate: 3 }),
        ]);
        const seriesTag = makeTag("tag-series", ["post-a", "post-b", "post-c"]);
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => [makeContent("topical", { parentId: "post-topical" })]),
            ready: computed(() => true),
        });

        const result = run(selected, [seriesTag]);

        await waitForExpect(() => {
            expect(result.items.value.map((i) => i._id)).toEqual([
                "series-a",
                "series-c",
                "topical",
                "content-tag-series",
            ]);
        });
    });

    it("drops a similar-article candidate already claimed by the series leg", async () => {
        const selected = makeContent("selected-b", { parentId: "post-b", parentTags: ["tag-series"] });
        const seriesNeighbour = makeContent("series-a", { parentId: "post-a", publishDate: 1 });
        await db.docs.bulkPut([seriesNeighbour, selected]);
        const seriesTag = makeTag("tag-series", ["post-a", "post-b"]);
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => [seriesNeighbour]),
            ready: computed(() => true),
        });

        const result = run(selected, [seriesTag]);

        await waitForExpect(() => {
            expect(result.items.value.filter((i) => i._id === "series-a")).toHaveLength(1);
        });
    });

    it("fills with the author's other content once similar articles run out", async () => {
        const selected = makeContent("selected", { author: "Jane Doe" });
        const byJane = makeContent("by-jane", { parentId: "post-by-jane", author: "Jane Doe" });
        await db.docs.put(byJane);

        const result = run(selected, []);

        await waitForExpect(() => {
            expect(result.items.value.map((i) => i._id)).toContain("by-jane");
        });
    });

    it("excludes the current article from the author leg", async () => {
        const selected = makeContent("selected", { author: "Jane Doe" });
        await db.docs.put(selected);

        const result = run(selected, []);

        await waitForExpect(() => {
            expect(result.items.value.map((i) => i._id)).not.toContain("selected");
        });
    });

    it("falls back to the global affinity feed only once other legs are exhausted", async () => {
        const selected = makeContent("selected");
        const affinityPick = makeContent("affinity-pick", { parentId: "post-affinity-pick" });
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => [affinityPick]),
            hasTags: computed(() => true),
            topTagIds: computed(() => ["tag-x"]),
            ready: computed(() => true),
        });

        const result = run(selected, []);

        await waitForExpect(() => {
            expect(result.items.value.map((i) => i._id)).toContain("affinity-pick");
        });
    });

    it("excludes an affinity-feed candidate already surfaced by an earlier leg", async () => {
        const byJane = makeContent("by-jane", { parentId: "post-by-jane", author: "Jane Doe" });
        await db.docs.put(byJane);
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => [byJane]),
            hasTags: computed(() => true),
            topTagIds: computed(() => []),
            ready: computed(() => true),
        });
        const selected = makeContent("selected", { author: "Jane Doe" });

        const result = run(selected, []);

        await waitForExpect(() => {
            expect(result.items.value.filter((i) => i._id === "by-jane")).toHaveLength(1);
        });
    });

    it("includes the topic tag docs themselves as final filler", async () => {
        const selected = makeContent("selected");
        const topic = makeTag("tag-topic", []);

        const result = run(selected, [topic]);

        await waitForExpect(() => {
            expect(result.items.value.map((i) => i._id)).toContain(topic._id);
        });
    });

    it("caps the merged list at the given limit", async () => {
        const selected = makeContent("selected");
        const similarItems = Array.from({ length: 15 }, (_, i) =>
            makeContent(`similar-${i}`, { parentId: `post-similar-${i}` }),
        );
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => similarItems),
            ready: computed(() => true),
        });

        const result = run(selected, [], { limit: 10 });

        await waitForExpect(() => {
            expect(result.items.value).toHaveLength(10);
        });
    });
});
