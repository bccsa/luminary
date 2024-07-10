import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { type ContentDto, accessMap, PublishStatus } from "luminary-shared";
import * as mockData from "@mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentPreview from "./EditContentPreview.vue";

describe("EditContentPreview.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("show the live preview if content is published", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Published,
        });
        const wrapper = mount(EditContentPreview, {
            props: {
                content: content.value,
            },
        });

        // Find and update the title input field
        const livePreview = wrapper.find('div[data-test="livePreview"]');

        // Check if the content's title was updated
        expect(livePreview.exists()).toBe(true);
    });

    it("don't show the live preview if content is not published", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Draft,
        });
        const wrapper = mount(EditContentPreview, {
            props: {
                content: content.value,
            },
        });

        // Find and update the title input field
        const livePreview = wrapper.find('div[data-test="livePreview"]');

        // Check if the content's title was updated
        expect(livePreview.exists()).not.toBe(true);
    });
});
