import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import RelatedContent from "./RelatedContent.vue";
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
            expect(wrapper.html()).not.toContain(mockTopicContentDto.title);
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
});
