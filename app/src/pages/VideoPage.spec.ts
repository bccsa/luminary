import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi, vitest, beforeAll, afterEach } from "vitest";
import VideoPage from "./VideoPage.vue";
import * as auth0 from "@auth0/auth0-vue";
import { accessMap, db, type ContentDto } from "luminary-shared";
import { ref } from "vue";
import {
    mockCategoryContentDto,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    viewAccessToAllContentMap,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { initLanguage } from "@/globalConfig";
import PinnedVideo from "@/components/VideoPage/PinnedVideo.vue";
import UnpinnedVideo from "@/components/VideoPage/UnpinnedVideo.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@auth0/auth0-vue", () => ({
    useAuth0: () => ({
        isAuthenticated: ref(true),
    }),
}));
vi.mock("vue-router");

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("VideoPage.vue", () => {
    beforeAll(async () => {
        accessMap.value = viewAccessToAllContentMap;
    });

    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
        });
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await initLanguage();
    });

    afterEach(async () => {
        vitest.clearAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    describe("VideoPage", () => {
        it("doesn't renders if there is no video", async () => {
            await db.docs.bulkPut([
                { ...mockCategoryContentDto, parentPinned: 1 },
                {
                    ...mockEnglishContentDto,
                    parentTags: [mockCategoryContentDto.parentId],
                    parentMedia: { ...mockEnglishContentDto.parentMedia, hlsUrl: "" },
                } as ContentDto,
            ]);

            const wrapper = mount(VideoPage);

            await waitForExpect(() => {
                const pinnedComponent = wrapper.findComponent(PinnedVideo);
                expect(pinnedComponent.exists()).toBe(true);
                expect(wrapper.text()).not.toContain(mockCategoryContentDto.title);
            });
        });

        it("renders pinned categories correctly", async () => {
            await db.docs.bulkPut([
                { ...mockCategoryContentDto, parentPinned: 1 },
                {
                    ...mockEnglishContentDto,
                    parentTags: [mockCategoryContentDto.parentId],
                } as ContentDto,
            ]);

            const wrapper = mount(VideoPage);

            await waitForExpect(() => {
                const pinnedComponent = wrapper.findComponent(PinnedVideo);
                expect(pinnedComponent.exists()).toBe(true);
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            });
        });

        it("renders unpinned categories correctly", async () => {
            await db.docs.bulkPut([
                { ...mockCategoryContentDto, parentPinned: 0 },
                {
                    ...mockEnglishContentDto,
                    parentTags: [mockCategoryContentDto.parentId],
                } as ContentDto,
            ]);

            const wrapper = mount(VideoPage);

            await waitForExpect(() => {
                const unpinnedComponent = wrapper.findComponent(UnpinnedVideo);
                expect(unpinnedComponent.exists()).toBe(true);
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            });
        });
    });
});
