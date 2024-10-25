import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentTitleSummary from "./EditContentTitleSummary.vue";
import { accessMap, type ContentDto } from "luminary-shared";

describe("EditContentTitleSummary.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can update the seo title", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentTitleSummary, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the title input field
        const options = wrapper.findAll("option");
        await options[1].trigger("click");

        const titleInput = wrapper.find('[name="seo-title"]');
        await titleInput.setValue("Updated Seo Title");

        // // Check if the content's title was updated
        expect(content.value.seoTitle).toBe("Updated Seo Title");
    });

    it("can update the seo summary", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentTitleSummary, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const options = wrapper.findAll("option");
        await options[1].trigger("click");

        // Find and update the summary input field
        const summaryInput = wrapper.find('[name="seo-summary"]');
        await summaryInput.setValue("Updated Seo Summary");

        // Check if the content's summary was updated
        expect(content.value.seoString).toBe("Updated Seo Summary");
    });
});
