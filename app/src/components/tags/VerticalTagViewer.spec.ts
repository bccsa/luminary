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
import { ref, computed } from "vue";
import { appLanguageIdsAsRef } from "@/globalConfig";

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({
        bucketBaseUrl: computed(() => "https://bucket.example.com"),
    }),
}));

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
        // Clearing the database before populating it helps prevent some sequencing issues causing the first to fail.
        await db.docs.clear();
        await db.localChanges.clear();

        await db.docs.bulkPut([mockEnglishContentDto, mockCategoryContentDto]);
        appLanguageIdsAsRef.value.unshift(mockLanguageDtoEng._id);
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

    it("hides the publish date if it is false", async () => {
        const wrapper = mount(VerticalTagViewer, {
            props: {
                tag: mockCategoryContentDto,
                showPublishDate: false,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Jan 1, 2024, 2:00 PM");
        });
    });
});
