import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import RelatedContent, {
    selectSeriesTag,
    MIN_SERIES_TAG_SIZE,
    MAX_SERIES_TAG_SIZE,
} from "./RelatedContent.vue";
import ReadMore from "./ReadMore.vue";
import ContentCardRow from "./ContentCardRow.vue";
import { mount } from "@vue/test-utils";
import { mockEnglishContentDto, mockLanguageDtoEng, mockTopicContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db, TagType, type ContentDto } from "luminary-shared";
import { computed, ref } from "vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useMoreLikeThis } from "@/composables/useMoreLikeThis";
import { useRecommendations } from "@/composables/useRecommendations";

vi.mock("@/composables/useMoreLikeThis", () => ({
    useMoreLikeThis: vi.fn(),
}));

vi.mock("@/composables/useRecommendations", () => ({
    useRecommendations: vi.fn(),
}));

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: ref({ params: { slug: mockEnglishContentDto.slug } }),
        })),
    };
});

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) =>
            key === "content.similar_title"
                ? "Similar articles"
                : mockLanguageDtoEng.translations[key] || key,
    }),
}));

// Similar articles / Because you read are deferred behind LazyMount (IntersectionObserver) so
// their composables don't run until the row scrolls near-view. jsdom has no layout and never
// fires the observer on its own, so capture every constructed callback and trigger it manually
// wherever a test needs one of those two rows to actually mount and resolve.
let intersectCallbacks: IntersectionObserverCallback[] = [];
function triggerLazyMounts() {
    intersectCallbacks.forEach((cb) =>
        cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
}

describe("RelatedContent", () => {
    beforeEach(async () => {
        intersectCallbacks = [];
        window.IntersectionObserver = class {
            constructor(cb: IntersectionObserverCallback) {
                intersectCallbacks.push(cb);
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        } as unknown as typeof IntersectionObserver;
        vi.mocked(useMoreLikeThis).mockReturnValue({ similar: computed(() => []) });
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => []),
            hasTags: computed(() => false),
            topTagIds: computed(() => []),
        });
        await db.docs.bulkPut([
            mockLanguageDtoEng,
            {
                ...mockTopicContentDto,
                parentTaggedDocs: ["post-post1", "post-post2", "post-post3"],
            } as ContentDto,
        ]);
        appLanguageIdsAsRef.value.unshift("lang-eng");
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("doesn't display the current post in the related topic", async () => {
        const wrapper = mount(RelatedContent, {
            props: {
                tags: [mockTopicContentDto],
                selectedContent: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            // The topic itself is included in Read more, but the current post isn't.
            expect(wrapper.html()).toContain(mockTopicContentDto.title);
            expect(wrapper.html()).not.toContain(mockEnglishContentDto.title);
        });
    });

    it("keeps displaying the existing tag-grouped related posts", async () => {
        await db.docs.bulkPut([
            { ...mockEnglishContentDto, parentTags: [mockTopicContentDto.parentId] },
            {
                ...mockEnglishContentDto,
                parentId: "post-post2",
                _id: "content-post2-eng",
                title: "Post 2",
                parentTags: [mockTopicContentDto.parentId],
            },
            {
                ...mockEnglishContentDto,
                parentId: "post-post3",
                _id: "content-post3-eng",
                title: "Post 3",
                parentTags: [mockTopicContentDto.parentId],
            },
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [
                    {
                        ...mockTopicContentDto,
                        parentTaggedDocs: ["post-post1", "post-post2", "post-post3"],
                    },
                ],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-post3-eng",
                    title: "Post 3",
                    parentTags: [mockTopicContentDto.parentId],
                },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockTopicContentDto.title);
            expect(wrapper.html()).toContain("Post 1");
            expect(wrapper.html()).toContain("Post 2");
        });
    });

    it("displays a Similar articles row when more-like-this returns content", async () => {
        const similarArticle = {
            ...mockEnglishContentDto,
            _id: "content-similar-eng",
            parentId: "post-similar",
            slug: "similar-eng",
            title: "Personalized similar article",
        } as ContentDto;
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => [similarArticle]),
        });

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [mockTopicContentDto],
                selectedContent: mockEnglishContentDto,
            },
        });
        triggerLazyMounts();

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Similar articles");
            expect(wrapper.html()).toContain(similarArticle.title);
        });
    });

    it("hides similar articles already shown in the Read more list", async () => {
        // Both lists draw from the same topical pool, so a candidate the flat Read more list
        // already shows must be dropped from Similar articles rather than appearing twice.
        const relatedPost = {
            ...mockEnglishContentDto,
            _id: "content-post2-eng",
            parentId: "post-post2",
            slug: "post2-eng",
            title: "Post 2",
            parentTags: [mockTopicContentDto.parentId],
        } as ContentDto;
        await db.docs.put(relatedPost);
        // more-like-this returns only that same already-shown post → nothing novel to add.
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => [relatedPost]),
        });

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [{ ...mockTopicContentDto, parentTaggedDocs: ["post-post2"] }],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-post3-eng",
                    title: "Post 3",
                },
            },
        });
        triggerLazyMounts();

        await waitForExpect(() => {
            // Steady state: the related-post query has resolved, so only the Read more list
            // renders (one ReadMore) and it shows Post 2; the Similar row deduped to empty.
            const readMores = wrapper.findAllComponents(ReadMore);
            expect(readMores).toHaveLength(1);
            expect(readMores[0].html()).toContain("Post 2");
            expect(wrapper.html()).not.toContain("Similar articles");
        });
    });

    it("doesn't display similar articles on a topic page", async () => {
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => [
                {
                    ...mockEnglishContentDto,
                    _id: "content-similar-eng",
                    parentId: "post-similar",
                    slug: "similar-eng",
                    title: "Personalized similar article",
                } as ContentDto,
            ]),
        });

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [mockTopicContentDto],
                selectedContent: { ...mockEnglishContentDto, parentTagType: TagType.Topic },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("Similar articles");
            expect(wrapper.html()).not.toContain("Personalized similar article");
        });
    });

    it("doesn't display the related posts when there are none", async () => {
        const wrapper = mount(RelatedContent, {
            props: {
                tags: [mockTopicContentDto],
                selectedContent: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("Post 2");
            expect(wrapper.html()).not.toContain("Post 3");
        });
    });

    // Guard: a tag's parentTaggedDocs is optional and may carry null/undefined ids.
    // Those must be filtered out so the query never becomes { parentId: { $in: [null] } },
    // which crashes CouchDB's _find (function_clause / 500).
    it("filters null/undefined ids and still shows the valid related post", async () => {
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                parentId: "post-post2",
                _id: "content-post2-eng",
                title: "Post 2",
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [
                    {
                        ...mockTopicContentDto,
                        parentTaggedDocs: [null, "post-post2", undefined] as any,
                    },
                ],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-post3-eng",
                    title: "Post 3",
                    parentTags: [mockTopicContentDto.parentId],
                },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Post 2");
        });
    });

    it("renders without error when a tag has no parentTaggedDocs", async () => {
        const wrapper = mount(RelatedContent, {
            props: {
                tags: [{ ...mockTopicContentDto, parentTaggedDocs: undefined } as any],
                selectedContent: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("Post 2");
            expect(wrapper.html()).not.toContain("Post 3");
        });
    });

    it("shows the summary on each related post, without tag chips", async () => {
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                parentId: "post-post2",
                _id: "content-post2-eng",
                title: "Post 2",
                summary: "A short related summary",
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [{ ...mockTopicContentDto, parentTaggedDocs: ["post-post2"] }],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-post3-eng",
                    title: "Post 3",
                },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("A short related summary");
        });
        expect(wrapper.findComponent(ReadMore).html()).toContain(mockTopicContentDto.title);
    });

    it("displays all topics in the same Read more collection as related posts", async () => {
        const topicB = {
            ...mockTopicContentDto,
            _id: "content-tag-topicB",
            parentId: "tag-topicB",
            slug: "content-tag-topicB",
            title: "Topic B",
        } as ContentDto;

        await db.docs.put({
            ...mockEnglishContentDto,
            parentId: "post-post2",
            _id: "content-post2-eng",
            title: "Post 2",
        } as ContentDto);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [{ ...mockTopicContentDto, parentTaggedDocs: ["post-post2"] }, topicB],
                selectedContent: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            const readMore = wrapper.findComponent(ReadMore).html();
            expect(readMore).toContain("Post 2");
            expect(readMore).toContain(mockTopicContentDto.title);
            expect(readMore).toContain("Topic B");
        });
    });

    it("shows a Continue this series row with the prev/next post sharing a series-sized tag", async () => {
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                _id: "content-series-a",
                parentId: "post-series-a",
                title: "Series 1",
                publishDate: 1,
                parentTags: [mockTopicContentDto.parentId],
            },
            {
                ...mockEnglishContentDto,
                _id: "content-series-b",
                parentId: "post-series-b",
                title: "Series 2",
                publishDate: 2,
                parentTags: [mockTopicContentDto.parentId],
            },
            {
                ...mockEnglishContentDto,
                _id: "content-series-c",
                parentId: "post-series-c",
                title: "Series 3",
                publishDate: 3,
                parentTags: [mockTopicContentDto.parentId],
            },
        ] as ContentDto[]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [
                    {
                        ...mockTopicContentDto,
                        parentTaggedDocs: ["post-series-a", "post-series-b", "post-series-c"],
                    },
                ],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-series-b",
                    parentId: "post-series-b",
                    title: "Series 2",
                    parentTags: [mockTopicContentDto.parentId],
                },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("content.series_title");
            expect(wrapper.html()).toContain("Series 1");
            expect(wrapper.html()).toContain("Series 3");
        });
        // The middle post's own neighbours render via the compact horizontal row, not the
        // full vertical Read more list.
        expect(wrapper.findComponent(ContentCardRow).props("items")).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ title: "Series 1" }),
                expect.objectContaining({ title: "Series 3" }),
            ]),
        );
    });

    it("shows a More from {author} row, excluding the current article", async () => {
        await db.docs.put({
            ...mockEnglishContentDto,
            _id: "content-by-jane",
            parentId: "post-by-jane",
            title: "Another Jane Doe piece",
            author: "Jane Doe",
        } as ContentDto);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-main",
                    parentId: "post-main",
                    title: "Main article",
                    author: "Jane Doe",
                },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("content.more_from_author");
            expect(wrapper.html()).toContain("Another Jane Doe piece");
            expect(wrapper.html()).not.toContain("Main article");
        });
    });

    it("shows a Because you read {tag} row from the viewer's own affinity profile", async () => {
        const recommendedItem = {
            ...mockEnglishContentDto,
            _id: "content-profile-pick",
            parentId: "post-profile-pick",
            title: "Personalized cross-topic pick",
        } as ContentDto;
        await db.docs.put({
            ...mockTopicContentDto,
            _id: "content-tag-sports",
            parentId: "tag-sports",
            title: "Sports",
        } as ContentDto);
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => [recommendedItem]),
            hasTags: computed(() => true),
            topTagIds: computed(() => ["tag-sports"]),
        });

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [],
                selectedContent: mockEnglishContentDto,
            },
        });
        triggerLazyMounts();

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("content.because_you_read");
            expect(wrapper.html()).toContain("Personalized cross-topic pick");
        });
    });

    it("excludes the current article from the Because you read row even though it hasn't been marked seen yet", async () => {
        await db.docs.put({
            ...mockTopicContentDto,
            _id: "content-tag-sports",
            parentId: "tag-sports",
            title: "Sports",
        } as ContentDto);
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => [mockEnglishContentDto]),
            hasTags: computed(() => true),
            topTagIds: computed(() => ["tag-sports"]),
        });

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [],
                selectedContent: mockEnglishContentDto,
            },
        });
        triggerLazyMounts();

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("content.because_you_read");
        });
    });

    it("defers Similar articles and Because you read until they scroll near the viewport", async () => {
        vi.mocked(useMoreLikeThis).mockReturnValue({
            similar: computed(() => [
                {
                    ...mockEnglishContentDto,
                    _id: "content-deferred-similar",
                    title: "Deferred similar",
                } as ContentDto,
            ]),
        });
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => [
                {
                    ...mockEnglishContentDto,
                    _id: "content-deferred-byr",
                    parentId: "post-deferred-byr",
                    title: "Deferred because-you-read",
                } as ContentDto,
            ]),
            hasTags: computed(() => true),
            topTagIds: computed(() => ["tag-sports"]),
        });
        await db.docs.put({
            ...mockTopicContentDto,
            _id: "content-tag-sports",
            parentId: "tag-sports",
            title: "Sports",
        } as ContentDto);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [mockTopicContentDto],
                selectedContent: mockEnglishContentDto,
            },
        });

        // Neither composable's own logic determines this — LazyMount simply hasn't fired
        // yet, so the child components (and the useMoreLikeThis/useRecommendations calls
        // inside them) haven't mounted at all.
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockTopicContentDto.title); // Read more rendered
        });
        expect(wrapper.html()).not.toContain("Deferred similar");
        expect(wrapper.html()).not.toContain("Deferred because-you-read");

        triggerLazyMounts();

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Deferred similar");
            expect(wrapper.html()).toContain("Deferred because-you-read");
        });
    });
});

describe("selectSeriesTag", () => {
    const tag = (parentTaggedDocs: (string | null | undefined)[]) =>
        ({ parentTaggedDocs }) as ContentDto;

    it("returns undefined for an empty tag list", () => {
        expect(selectSeriesTag([])).toBeUndefined();
    });

    it("skips tags below the minimum series size", () => {
        const tooSmall = tag(Array.from({ length: MIN_SERIES_TAG_SIZE - 1 }, (_, i) => `p${i}`));
        expect(selectSeriesTag([tooSmall])).toBeUndefined();
    });

    it("skips tags above the maximum series size", () => {
        const tooBig = tag(Array.from({ length: MAX_SERIES_TAG_SIZE + 1 }, (_, i) => `p${i}`));
        expect(selectSeriesTag([tooBig])).toBeUndefined();
    });

    it("picks the smallest qualifying tag among several candidates", () => {
        const broad = tag(Array.from({ length: 10 }, (_, i) => `broad-${i}`));
        const narrow = tag(Array.from({ length: 3 }, (_, i) => `narrow-${i}`));
        expect(selectSeriesTag([broad, narrow])).toBe(narrow);
    });

    it("ignores null/undefined holes when sizing a tag", () => {
        const withHoles = tag([null, "p1", undefined, "p2"]);
        // Two real ids -> exactly at MIN_SERIES_TAG_SIZE, so it still qualifies.
        expect(selectSeriesTag([withHoles])).toBe(withHoles);
    });
});
