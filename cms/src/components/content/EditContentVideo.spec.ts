import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { type ContentDto, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentVideo from "./EditContentVideo.vue";
import LInput from "../forms/LInput.vue";

describe("EditContentVideo.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("displays the video field, when it is defined", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            video: "https://example.com/video.mp4",
        });
        const wrapper = mount(EditContentVideo, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const videoContent = wrapper.find('div[data-test="videoContent"]');
        expect(videoContent.exists()).toBe(true);
    });

    it("displays video URL in the text input", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            video: "https://example.com/video.mp4",
        });

        const wrapper = mount(EditContentVideo, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find the input field within LInput
        const videoInputWrapper = wrapper.find("input[name='video']");
        const videoInput = videoInputWrapper.element as HTMLInputElement;

        // Check if the input value is correctly set
        expect(videoInput.value).toBe("https://example.com/video.mp4");
    });

    it("can update the video input field", async () => {
        const content = ref<ContentDto>({
            ...mockData.mockEnglishContentDto,
            video: "https://example.com/video.mp4",
        });
        const wrapper = mount(EditContentVideo, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const videoInputWrapper = wrapper.findComponent(LInput).find("input[name='video']");
        const videoInput = videoInputWrapper.element as HTMLInputElement;

        await videoInputWrapper.setValue("https://example.com/new-video.mp4");

        expect(videoInput.value).toBe("https://example.com/new-video.mp4");
    });
});
