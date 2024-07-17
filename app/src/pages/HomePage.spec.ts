import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi, vitest, beforeAll, afterEach } from "vitest";
import HomePage from "./HomePage.vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import * as auth0 from "@auth0/auth0-vue";
import { accessMap, db } from "luminary-shared";
import { ref } from "vue";
import {
    mockCategoryContentDto,
    mockCategoryDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockPostDto,
    viewAccessToAllContentMap,
} from "@/tests/mockdata";
import { setActivePinia, storeToRefs } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import waitForExpect from "wait-for-expect";

vi.mock("@auth0/auth0-vue");
vi.mock("vue-router");

describe("HomePage.vue", () => {
    beforeAll(() => {
        accessMap.value = viewAccessToAllContentMap;
    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        const store = storeToRefs(useGlobalConfigStore());
        const { appLanguage } = store;
        appLanguage.value = mockLanguageDtoEng;
    });

    afterEach(() => {
        vitest.clearAllMocks();
        db.docs.clear();
        db.localChanges.clear();
    });

    describe("No content notifications", () => {
        it("renders correctly with no content and not authenticated", () => {
            (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
                isAuthenticated: ref(false),
            });
            const wrapper = mount(HomePage);

            expect(wrapper.text()).toContain(
                "There is currently no content available. If you have an account, first  log in.",
            );
        });

        it("renders correctly with no content and authenticated", () => {
            (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
                isAuthenticated: ref(true),
            });
            const wrapper = mount(HomePage);

            expect(wrapper.text()).toContain(
                "You don't have access to any content. If you believe this is an error, send your contact person a message.",
            );
        });
    });

    describe("Content display tests", () => {
        it("renders pinned categories correctly", async () => {
            db.docs.bulkPut([
                { ...mockCategoryDto, pinned: true },
                mockCategoryContentDto,
                { ...mockEnglishContentDto, tags: [mockCategoryDto._id] },
                { ...mockPostDto, tags: [mockCategoryDto._id] },
            ]);

            const wrapper = mount(HomePage);

            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            });
        });

        it("renders unpinned categories correctly", async () => {
            db.docs.bulkPut([
                { ...mockCategoryDto, pinned: false },
                mockCategoryContentDto,
                { ...mockEnglishContentDto, tags: [mockCategoryDto._id] },
                { ...mockPostDto, tags: [mockCategoryDto._id] },
            ]);

            const wrapper = mount(HomePage);

            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
            });
        });

        it("displays the newest content", async () => {
            db.docs.bulkPut([mockEnglishContentDto, mockPostDto]);

            const wrapper = mount(HomePage);

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("Newest Content");
                expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            });
        });
    });

    describe("Language selection tests", () => {
        it("updates the category title and content when the language is changed", async () => {
            // Mock initial database setup with English content
            db.docs.bulkPut([
                mockCategoryDto,
                mockCategoryContentDto,
                { ...mockEnglishContentDto, tags: [mockCategoryDto._id] },
                { ...mockPostDto, tags: [mockCategoryDto._id] },

                {
                    ...mockCategoryContentDto,
                    _id: "content-tag-category1-fr",
                    language: mockLanguageDtoFra._id,
                    title: "Catégorie 1",
                    summary: "Exemple de tag",
                },
                { ...mockFrenchContentDto, title: "Poste 1" },
            ]);

            // Mount the component
            const wrapper = mount(HomePage);

            // Assert that the category title reflects the new language
            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
                expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            });

            // Change the language
            const store = useGlobalConfigStore();
            store.appLanguage = mockLanguageDtoFra;

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("Catégorie 1");
                expect(wrapper.text()).toContain("Poste 1");
            });
        });
    });
});
