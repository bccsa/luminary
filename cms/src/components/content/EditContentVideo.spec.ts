import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { fullAccessToAllContentMap, mockEnglishContentDto } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import type { ContentDto } from "@/types";
import EditContentVideo from "./EditContentVideo.vue";

describe("EditContentPreview.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("does not display video field when not defined", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
        const wrapper = mount(EditContentVideo, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const videoContent = wrapper.find('div[data-test="videoContent"]');
        expect(videoContent.exists()).toBe(true);

        expect(wrapper.html()).not.toContain(videoContent);
    });

    it(" display video field, when is defined", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
        const wrapper = mount(EditContentVideo, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const videoContent = wrapper.find('div[data-test="videoContent"]');
        expect(videoContent.exists()).toBe(true);

        expect(wrapper.html()).toContain(videoContent.text());
    });
});
