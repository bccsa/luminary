import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentBasic from "./ContentBasic.vue";
import { accessMap, type ContentDto } from "luminary-shared";

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can update the title", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the title input field
        const titleInput = wrapper.find('[name="title"]');
        await titleInput.setValue("Updated Title");

        // Check if the content's title was updated
        expect(content.value.title).toBe("Updated Title");
    });

    it("can update the summary", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the summary input field
        const summaryInput = wrapper.find('[name="summary"]');
        await summaryInput.setValue("Updated Summary");

        // Check if the content's summary was updated
        expect(content.value.summary).toBe("Updated Summary");
    });
});
