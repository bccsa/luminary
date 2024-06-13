import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { fullAccessToAllContentMap, mockEnglishContentDto } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import EditContentPreview from "./EditContentPreview.vue";
import type { ContentDto } from "@/types";

describe("EditContentPreview.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("show the live preview if content is published", async () => {
        const content = ref<ContentDto>({ ...mockEnglishContentDto, status: "published" });
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
        const content = ref<ContentDto>({ ...mockEnglishContentDto, status: "draft" });
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
