import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import LanguageSelector2 from "./LanguageSelector2.vue";
import LBadge from "@/components/common/LBadge.vue";

describe("LanguageSelector2.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("displays the current language", async () => {
        const wrapper = mount(LanguageSelector2, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                content: [mockData.mockEnglishContentDto],
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        const selectLanguage = wrapper.find("button[data-test='language-selector']");
        await selectLanguage.trigger("click");

        const select = wrapper.find("button[data-test='select-language-eng']");
        await select.trigger("click");

        expect(wrapper.text()).toContain("English");
        expect(wrapper.text()).not.toContain("French");
        expect(wrapper.text()).not.toContain("Swahili");
    });

    it("can handle an unset language", async () => {
        const wrapper = mount(LanguageSelector2, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                content: [],
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        expect(wrapper.text()).toContain("Select language");
        expect(wrapper.text()).not.toContain("English");
        expect(wrapper.text()).not.toContain("French");
        expect(wrapper.text()).not.toContain("Swahili");
    });

    it("can display a dropdown with all languages", async () => {
        const wrapper = mount(LanguageSelector2, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                content: [],
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        const selectLanguage = wrapper.find("button[data-test='language-selector']");
        await selectLanguage.trigger("click");

        expect(wrapper.text()).toContain("English");
        expect(wrapper.text()).toContain("Add translation");
        expect(wrapper.text()).toContain("Français");
        expect(wrapper.text()).toContain("Swahili");
    });

    it("displays a label with the translation status", async () => {
        const wrapper = mount(LanguageSelector2, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                content: [
                    mockData.mockEnglishContentDto,
                    { ...mockData.mockFrenchContentDto, status: "draft" },
                ],
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        await wrapper.find("button[data-test='language-selector']").trigger("click");

        const badge = wrapper.findAllComponents(LBadge);
        expect(badge[0].props().variant).toBe("success"); // English content = Published
        expect(badge[1].props().variant).toBe("info"); // French content = Draft
        expect(badge[2].props().variant).toBe("default"); // Swahili = no translation yet
    });
    describe("permissions", () => {
        it("hides untranslated groups that the user doesn't have translate permission on", async () => {
            const wrapper = mount(LanguageSelector2, {
                props: {
                    languages: [mockData.mockLanguageDtoEng, mockData.mockLanguageDtoFra],
                    content: [mockData.mockEnglishContentDto, mockData.mockFrenchContentDto],
                },
            });

            const selectLanguage = wrapper.find("button[data-test='language-selector']");
            await selectLanguage.trigger("click");

            expect(wrapper.text()).toContain("English");
            expect(wrapper.text()).toContain("Français");
            expect(wrapper.text()).not.toContain("Add translation");
            expect(wrapper.text()).not.toContain("Swahili");
        });
    });
});
