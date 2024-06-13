import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { fullAccessToAllContentMap, mockEnglishContentDto } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import EditContentBasic from "./EditContentBasic.vue";
import type { ContentDto } from "@/types";

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can update the title", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
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
        const content = ref<ContentDto>(mockEnglishContentDto);
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

    it("sets expiry date when shortcut buttons are clicked", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Click the expiry shortcut button
        const oneButton = wrapper.find('[data-test="1"]');
        await oneButton.trigger("click");
        const weekButton = wrapper.find('[data-test="W"]');
        await weekButton.trigger("click");

        // Wait for Vue to process the state change
        expect(content.value.expiryDate).toBeGreaterThan(
            content.value.publishDate as unknown as number,
        );
    });
});
