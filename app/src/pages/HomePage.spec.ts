import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi, vitest, beforeAll, afterEach } from "vitest";
import HomePage from "./HomePage.vue";
import * as auth0 from "@auth0/auth0-vue";
import { accessMap, db } from "luminary-shared";
import { ref } from "vue";
import {
    mockCategoryContentDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    viewAccessToAllContentMap,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef, initLanguage } from "@/globalConfig";
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

describe("HomePage.vue", () => {
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

    describe("Language selection tests", () => {
        it("updates the category title and content when the language is changed", async () => {
            // Mock initial database setup with English content
            await db.docs.bulkPut([
                { ...mockCategoryContentDto, parentPinned: 1 },
                { ...mockEnglishContentDto, parentTags: [mockCategoryContentDto.parentId] },
                {
                    ...mockCategoryContentDto,
                    _id: "content-tag-category1-fr",
                    language: mockLanguageDtoFra._id,
                    title: "Catégorie 1",
                    summary: "Exemple de tag",
                    parentPinned: 1,
                },
                { ...mockFrenchContentDto, title: "Poste 1" },
            ]);

            // Mount the component
            const wrapper = mount(HomePage);

            await waitForExpect(async () => {
                expect(wrapper.text()).toContain(mockCategoryContentDto.title);
                expect(wrapper.text()).toContain(mockEnglishContentDto.title);
            });

            // Change the language
            appLanguageIdsAsRef.value.unshift(mockFrenchContentDto.language);
            await waitForExpect(() => {
                expect(wrapper.text()).toContain("Catégorie 1");
                expect(wrapper.text()).toContain("Poste 1");
            });
        });
    });

});
