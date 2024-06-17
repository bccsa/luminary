import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { fullAccessToAllContentMap, mockEnglishContentDto } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import type { ContentDto } from "@/types";
import EditContentVideo from "./EditContentVideo.vue";
import LInput from "../forms/LInput.vue";

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
        const content = ref<ContentDto>({ ...mockEnglishContentDto, video: undefined });
        const wrapper = mount(EditContentVideo, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const videoContent = wrapper.find('div[data-test="videoContent"]');
        expect(videoContent.exists()).toBe(false);
    });

    it("display video field, when is defined", async () => {
        const content = ref<ContentDto>({
            ...mockEnglishContentDto,
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
            ...mockEnglishContentDto,
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
            ...mockEnglishContentDto,
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
