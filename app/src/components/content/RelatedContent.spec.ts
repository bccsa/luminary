import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import RelatedContent from "./RelatedContent.vue";
import ReadMore from "./ReadMore.vue";
import { mount } from "@vue/test-utils";
import { mockEnglishContentDto, mockLanguageDtoEng, mockTopicContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db, type ContentDto } from "luminary-shared";
import { ref } from "vue";
import { appLanguageIdsAsRef } from "@/globalConfig";

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
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

// Cold/empty defaults keep the existing tests green; the engine-influenced tests below
// mutate these holders to drive seen-exclusion and affinity ordering. The refs themselves
// are created lazily inside the (async) mock factories so `ref` is imported, not TDZ'd.
const affinityStoreMock = vi.hoisted(() => ({ affinityProfile: null as any }));
const seenStoreMock = vi.hoisted(() => ({ seenVersion: null as any, seenIds: [] as string[] }));

vi.mock("@/recommendation/affinityStore", async () => {
    const { ref } = await import("vue");
    affinityStoreMock.affinityProfile = ref({ affinity: {}, lastDecayUtc: undefined });
    return { affinityProfile: affinityStoreMock.affinityProfile };
});
vi.mock("@/recommendation/seenStore", async () => {
    const { ref } = await import("vue");
    seenStoreMock.seenVersion = ref(0);
    return {
        seenVersion: seenStoreMock.seenVersion,
        getSeenArticleIds: () => seenStoreMock.seenIds,
    };
});

describe("RelatedContent", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([
            mockLanguageDtoEng,
            {
                ...mockTopicContentDto,
                parentTaggedDocs: ["post-post1", "post-post2", "post-post3"],
            } as ContentDto,
        ]);
        appLanguageIdsAsRef.value.unshift("lang-eng");
        affinityStoreMock.affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        seenStoreMock.seenIds = [];
        seenStoreMock.seenVersion.value++;
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

    it("displays the related posts", async () => {
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
                    parentId: "post-post3",
                    _id: "content-post3-eng",
                    title: "Post 3",
                    parentTags: [mockTopicContentDto.parentId],
                },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Post 1");
            expect(wrapper.html()).toContain("Post 2");
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
                tags: [
                    { ...mockTopicContentDto, parentTaggedDocs: ["post-post2"] },
                    topicB,
                ],
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

    it("excludes already-seen articles from Read more", async () => {
        seenStoreMock.seenIds = ["content-postA-eng"];
        seenStoreMock.seenVersion.value++;

        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                parentId: "post-postA",
                _id: "content-postA-eng",
                title: "Seen Post",
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
            {
                ...mockEnglishContentDto,
                parentId: "post-postB",
                _id: "content-postB-eng",
                title: "Unseen Post",
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [
                    {
                        ...mockTopicContentDto,
                        parentTaggedDocs: ["post-postA", "post-postB"],
                    },
                ],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-other-eng",
                    title: "Other",
                } as ContentDto,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Unseen Post");
            expect(wrapper.html()).not.toContain("Seen Post");
        });
    });

    it("excludes another translation of the current article from Read more", async () => {
        // English is the preferred display language, but the user is reading the French
        // translation of "Shared Article". The Read-more query returns the English translation
        // (preferred), which shares `parentId` with the article being read but has a different
        // `_id`. Excluding by `_id` would let that English card through as a duplicate of the
        // article the user is already reading; excluding by `parentId` drops it.
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                parentId: "post-shared",
                _id: "content-shared-eng",
                slug: "shared-eng",
                title: "Shared Article",
                language: "lang-eng",
                availableTranslations: ["lang-eng", "lang-fra"],
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
            {
                ...mockEnglishContentDto,
                parentId: "post-shared",
                _id: "content-shared-fra",
                slug: "shared-fra",
                title: "Shared Article",
                language: "lang-fra",
                availableTranslations: ["lang-eng", "lang-fra"],
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
            {
                ...mockEnglishContentDto,
                parentId: "post-other",
                _id: "content-other-eng",
                slug: "other-eng",
                title: "Other Article",
                parentTags: [mockTopicContentDto.parentId],
            } as ContentDto,
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [
                    {
                        ...mockTopicContentDto,
                        parentTaggedDocs: ["post-shared", "post-other"],
                    },
                ],
                selectedContent: {
                    ...mockEnglishContentDto,
                    parentId: "post-shared",
                    _id: "content-shared-fra",
                    slug: "shared-fra",
                    title: "Shared Article",
                    language: "lang-fra",
                } as ContentDto,
            },
        });

        await waitForExpect(() => {
            // The unrelated post still appears...
            expect(wrapper.findComponent(ReadMore).html()).toContain("Other Article");
            // ...but neither translation of the article being read shows in Read more.
            const sharedCards = wrapper
                .findAll("[data-mobile-title]")
                .filter((el) => el.text().includes("Shared Article"));
            expect(sharedCards).toHaveLength(0);
        });
    });

    it("ranks content sharing more of the current article's tags above a newer, less-related item", async () => {
        // Relevance (tag overlap with the current article) is the primary signal: an item
        // sharing two of the current article's tags ranks above a newer item sharing only one,
        // even though recency alone would put the newer item first.
        affinityStoreMock.affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        const baseDate = mockEnglishContentDto.publishDate ?? 0;
        const day = 1000 * 60 * 60 * 24;
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                parentId: "post-sharesTwo",
                _id: "content-sharesTwo-eng",
                title: "Shares Two Tags",
                parentTags: [mockTopicContentDto.parentId, "tag-topicX"],
                publishDate: baseDate, // older
            } as ContentDto,
            {
                ...mockEnglishContentDto,
                parentId: "post-sharesOne",
                _id: "content-sharesOne-eng",
                title: "Shares One Tag",
                parentTags: [mockTopicContentDto.parentId],
                publishDate: baseDate + 30 * day, // newer — recency alone would rank it first
            } as ContentDto,
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [
                    {
                        ...mockTopicContentDto,
                        parentTaggedDocs: ["post-sharesTwo", "post-sharesOne"],
                    },
                ],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-other-eng",
                    title: "Other",
                    parentTags: [mockTopicContentDto.parentId, "tag-topicX"],
                } as ContentDto,
            },
        });

        await waitForExpect(() => {
            const titles = wrapper.findAll("[data-mobile-title]").map((el) => el.text());
            const twoIdx = titles.findIndex((t) => t.includes("Shares Two Tags"));
            const oneIdx = titles.findIndex((t) => t.includes("Shares One Tag"));
            expect(twoIdx).toBeGreaterThanOrEqual(0);
            expect(oneIdx).toBeGreaterThanOrEqual(0);
            expect(twoIdx).toBeLessThan(oneIdx);
        });
    });

    it("ranks a topic card above an ordinary related post", async () => {
        // The topic boost (TOPIC_BOOST_WEIGHT) should comfortably outweigh a typical post's
        // referenceWeight contribution (+1 for sharing one tag with the current article).
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
                tags: [{ ...mockTopicContentDto, parentTaggedDocs: ["post-post2"] }],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-other-eng",
                    title: "Other",
                    parentTags: [mockTopicContentDto.parentId],
                } as ContentDto,
            },
        });

        await waitForExpect(() => {
            const titles = wrapper.findAll("[data-mobile-title]").map((el) => el.text());
            const topicIdx = titles.findIndex((t) => t.includes(mockTopicContentDto.title));
            const postIdx = titles.findIndex((t) => t.includes("Post 2"));
            expect(topicIdx).toBeGreaterThanOrEqual(0);
            expect(postIdx).toBeGreaterThanOrEqual(0);
            expect(topicIdx).toBeLessThan(postIdx);
        });
    });

    it("lets a post sharing many tags with the current article outrank a boosted topic", async () => {
        // The boost is a soft nudge, not a hard pin: a post overlapping enough of the current
        // article's tags can still out-score TOPIC_BOOST_WEIGHT via the referenceWeight leg.
        const manyTags = ["tag-x1", "tag-x2", "tag-x3", "tag-x4", "tag-x5", "tag-x6"];
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                parentId: "post-heavy",
                _id: "content-heavy-eng",
                title: "Heavily Related Post",
                parentTags: [mockTopicContentDto.parentId, ...manyTags],
            } as ContentDto,
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [{ ...mockTopicContentDto, parentTaggedDocs: ["post-heavy"] }],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-other-eng",
                    title: "Other",
                    parentTags: [mockTopicContentDto.parentId, ...manyTags],
                } as ContentDto,
            },
        });

        await waitForExpect(() => {
            const titles = wrapper.findAll("[data-mobile-title]").map((el) => el.text());
            const topicIdx = titles.findIndex((t) => t.includes(mockTopicContentDto.title));
            const postIdx = titles.findIndex((t) => t.includes("Heavily Related Post"));
            expect(topicIdx).toBeGreaterThanOrEqual(0);
            expect(postIdx).toBeGreaterThanOrEqual(0);
            expect(postIdx).toBeLessThan(topicIdx);
        });
    });

    it("keeps affinity as a mild nudge: a much newer non-affinity item beats an older affinity one", async () => {
        // At equal relevance (both share one tag) recency orders; affinity is tempered below
        // the recency span so it cannot leapfrog a much newer item. Under the old un-tempered
        // weight the affinity-favoured older item would have won.
        const now = Date.now();
        const day = 1000 * 60 * 60 * 24;
        affinityStoreMock.affinityProfile.value = {
            // One strong engagement on the raw config scale (~0.005 → nominal ~0.5).
            affinity: { [mockTopicContentDto.parentId]: 0.005 },
            lastDecayUtc: undefined,
        };
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                parentId: "post-affOld",
                _id: "content-affOld-eng",
                title: "Affinity Old",
                parentTags: [mockTopicContentDto.parentId],
                publishDate: now - 365 * day,
            } as ContentDto,
            {
                ...mockEnglishContentDto,
                parentId: "post-recNew",
                _id: "content-recNew-eng",
                title: "Recent New",
                parentTags: [mockTopicContentDto.parentId],
                publishDate: now - day,
            } as ContentDto,
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tags: [
                    {
                        ...mockTopicContentDto,
                        parentTaggedDocs: ["post-affOld", "post-recNew"],
                    },
                ],
                selectedContent: {
                    ...mockEnglishContentDto,
                    _id: "content-other-eng",
                    title: "Other",
                    parentTags: [mockTopicContentDto.parentId],
                } as ContentDto,
            },
        });

        await waitForExpect(() => {
            const titles = wrapper.findAll("[data-mobile-title]").map((el) => el.text());
            const recIdx = titles.findIndex((t) => t.includes("Recent New"));
            const affIdx = titles.findIndex((t) => t.includes("Affinity Old"));
            expect(recIdx).toBeGreaterThanOrEqual(0);
            expect(affIdx).toBeGreaterThanOrEqual(0);
            expect(recIdx).toBeLessThan(affIdx);
        });
    });
});
