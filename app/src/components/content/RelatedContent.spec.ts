import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import RelatedContent from "./RelatedContent.vue";
import ReadMore from "./ReadMore.vue";
import { mount } from "@vue/test-utils";
import { mockEnglishContentDto, mockLanguageDtoEng, mockTopicContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db, TagType, type ContentDto } from "luminary-shared";
import { computed, ref } from "vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useMoreLikeThis } from "@/composables/useMoreLikeThis";

vi.mock("@/composables/useMoreLikeThis", () => ({
    useMoreLikeThis: vi.fn(),
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

describe("RelatedContent", () => {
    beforeEach(async () => {
        vi.mocked(useMoreLikeThis).mockReturnValue({ similar: computed(() => []) });
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
});
