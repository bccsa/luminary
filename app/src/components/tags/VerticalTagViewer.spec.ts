import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import VerticalTagViewer from "./VerticalTagViewer.vue";
import { mockCategoryDto, mockEnglishContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db } from "luminary-shared";
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
describe("VerticalTagViewer", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockEnglishContentDto, mockCategoryDto]);
    });

    afterEach(async () => {
        await db.docs.clear();
        vi.clearAllMocks();
    });

    it("displays the posts", async () => {
        const wrapper = mount(VerticalTagViewer, {
            props: {
                tag: mockCategoryDto,
                queryOptions: { languageId: "lang-eng" },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.html()).toContain(mockEnglishContentDto.parentImage);
        });
    });
});
