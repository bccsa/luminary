import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import {
    fullAccessToAllContentMap,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import { DateTime } from "luxon";
import LanguageSelector2 from "./LanguageSelector2.vue";

describe("LanguageSelector2.vue", () => {
    beforeAll(async () => {
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                whereTypeAsRef: vi.fn((docType) => {
                    if (docType === "post") {
                        return ref([mockPostDto]);
                    } else if (docType === "language") {
                        return ref([mockLanguageDtoEng, mockLanguageDtoFra]);
                    }

                    return ref([]);
                }),
                whereParentAsRef: vi.fn(() => {
                    return ref([mockEnglishContentDto, mockFrenchContentDto]);
                }),
                isLocalChange: vi.fn(() => {
                    return false;
                }),
                toDateTime: vi.fn((val) => {
                    return DateTime.fromMillis(val);
                }),
            },
        }));

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("should switch content language", async () => {
        const wrapper = mount(LanguageSelector2, {
            props: {
                languages: [mockLanguageDtoEng, mockLanguageDtoFra],
                content: [mockEnglishContentDto, mockFrenchContentDto],
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Wait for the component to update
        await wrapper.vm.$nextTick();

        // Check if language selector button exists
        expect(wrapper.find("[data-test='language-selector']").exists()).toBe(true);

        // Simulate opening the language selector dropdown
        await wrapper.find("[data-test='language-selector']").trigger("click");

        // Check if English language option exists
        expect(wrapper.find("[data-test='select-language-eng']").exists()).toBe(true);

        // Check if French language option exists
        expect(wrapper.find("[data-test='select-language-fra']").exists()).toBe(true);

        // Simulate clicking on the French language option
        await wrapper.find("[data-test='select-language-fra']").trigger("click");

        // Check if the selected language is updated to French
        expect(wrapper.text()).toContain("Français");
    });
});
