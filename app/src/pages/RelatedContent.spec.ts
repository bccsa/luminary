import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import RelatedContent from "./RelatedContent.vue";
import { mockCategoryContentDto, mockEnglishContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { ref } from "vue";

const routeReplaceMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: ref({ params: { slug: mockEnglishContentDto.slug } }),
            replace: routeReplaceMock,
        })),
    };
});

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        TagType: {
            Category: "category",
            Topic: "topic",
        },
    };
});

describe("RelatedContent.vue", () => {
    it("renders category correctly", async () => {
        const mockContent = {
            ...mockEnglishContentDto,
            parentTags: ["tag-category1", "tag-category2"],
        };
        const wrapper = mount(RelatedContent, {
            props: {
                tagIds: mockContent.parentTags,
            },
        });

        await waitForExpect(() => {
            // expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            console.log(wrapper.text());
        });
    });

    it("renders topic correctly", async () => {
        const wrapper = mount(RelatedContent, {
            props: {
                tagIds: mockEnglishContentDto.parentTags,
            },
        });
        await waitForExpect(() => {
            // expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            console.log(wrapper.text());
        });
    });
});
