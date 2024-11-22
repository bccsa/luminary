import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import VerticalTagViewer from "./VerticalTagViewer.vue";
import {
    mockCategoryContentDto,
    mockEnglishContentDto,
    mockLanguageDtoEng,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { db } from "luminary-shared";
import { ref } from "vue";
import { appLanguageIdAsRef } from "@/globalConfig";

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
        await db.docs.bulkPut([mockEnglishContentDto, mockCategoryContentDto]);
        appLanguageIdAsRef.value = mockLanguageDtoEng._id;
    });

    afterEach(async () => {
        await db.docs.clear();
        vi.clearAllMocks();
    });

    it("displays the posts", async () => {
        const wrapper = mount(VerticalTagViewer, {
            props: {
                tag: mockCategoryContentDto,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.html()).toContain(
                mockEnglishContentDto.parentImageData?.fileCollections[0].imageFiles[0].filename,
            );
        });
    });
});
