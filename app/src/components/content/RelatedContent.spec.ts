import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import RelatedContent from "./RelatedContent.vue";
import { mount } from "@vue/test-utils";
import {
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockTopicContentDto,
    mockTopicDto,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db } from "luminary-shared";
import { ref } from "vue";
import { appLanguageIdAsRef } from "@/globalConfig";

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

describe("RelatedContent", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockTopicContentDto, mockTopicDto]);
        appLanguageIdAsRef.value = "lang-eng";
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("doesn't display the current post in the related topic", async () => {
        const wrapper = mount(RelatedContent, {
            props: {
                tag: [mockTopicDto],
                contentId: mockEnglishContentDto._id,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain(mockTopicContentDto.title);
            expect(wrapper.html()).not.toContain(mockEnglishContentDto.title);
        });
    });

    it("displays the related posts", async () => {
        await db.docs.bulkPut([
            { ...mockEnglishContentDto, parentTags: [mockTopicDto._id] },
            {
                ...mockEnglishContentDto,
                _id: "content-post2-eng",
                title: "Post 2",
                parentTags: [mockTopicDto._id],
            },
            {
                ...mockEnglishContentDto,
                _id: "content-post3-eng",
                title: "Post 3",
                parentTags: [mockTopicDto._id],
            },
        ]);

        const wrapper = mount(RelatedContent, {
            props: {
                tag: [mockTopicDto],
                contentId: "content-post3-eng",
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
                tag: [mockTopicDto],
                contentId: mockEnglishContentDto._id,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("Post 1");
            expect(wrapper.html()).not.toContain("Post 2");
        });
    });
});
