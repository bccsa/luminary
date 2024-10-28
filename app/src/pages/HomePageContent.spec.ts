import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi, vitest, beforeAll, afterEach } from "vitest";
import * as auth0 from "@auth0/auth0-vue";
import { accessMap, db } from "luminary-shared";
import { ref } from "vue";
import {
    mockCategoryContentDto,
    mockCategoryDto,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockPostDto,
    viewAccessToAllContentMap,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { initLanguage } from "@/globalConfig";
import HomePageContent from "./HomePageContent.vue";

vi.mock("@auth0/auth0-vue");
vi.mock("vue-router");

describe("HomePage.vue", () => {
    beforeAll(() => {
        accessMap.value = viewAccessToAllContentMap;
        initLanguage();
    });

    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
    });

    afterEach(async () => {
        vitest.clearAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    describe("No content notifications", () => {
        it("renders correctly with no content and not authenticated", async () => {
            (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
                isAuthenticated: ref(false),
            });
            const wrapper = mount(HomePageContent);
            await waitForExpect(() => {
                expect(wrapper.text()).toContain(
                    "There is currently no content available. Please log in if you have an account.",
                );
            });
        });

        it("renders correctly with no content and authenticated", async () => {
            (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
                isAuthenticated: ref(true),
            });
            const wrapper = mount(HomePageContent);

            await waitForExpect(() => {
                expect(wrapper.text()).toContain(
                    "You don't have access to any content. If you believe this is an error, send your contact person a message.",
                );
            });
        });
    });

    describe("Content display tests", () => {
        it("renders pinned categories correctly", async () => {
            await db.docs.bulkPut([
                { ...mockCategoryDto, pinned: 1 },
                mockCategoryContentDto,
                { ...mockEnglishContentDto, tags: [mockCategoryDto._id] },
                { ...mockPostDto, tags: [mockCategoryDto._id] },
            ]);

            const wrapper = mount(HomePageContent);

            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            });
        });

        it("renders unpinned categories correctly", async () => {
            await db.docs.bulkPut([
                { ...mockCategoryDto, pinned: 0 },
                mockCategoryContentDto,
                { ...mockEnglishContentDto, tags: [mockCategoryDto._id] },
                { ...mockPostDto, tags: [mockCategoryDto._id] },
            ]);

            const wrapper = mount(HomePageContent);

            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            });
        });

        it("displays the newest content", async () => {
            await db.docs.bulkPut([mockEnglishContentDto, mockPostDto]);

            const wrapper = mount(HomePageContent);

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("Newest");
                expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            });
        });
    });
});
