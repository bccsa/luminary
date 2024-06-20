import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import { mockData, type ContentDto } from "luminary-shared";
import EditContentText from "./EditContentText.vue";
import waitForExpect from "wait-for-expect";

describe("EditContentPreview.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("display text, when is defined", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentText, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const mockText = JSON.parse(mockData.mockEnglishContentDto.text!).content[0].content[0]
            .text;

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockText);
        });
    });

    it("hide editor when text is not defined", async () => {
        const content = ref<ContentDto>({ ...mockData.mockEnglishContentDto, text: undefined });
        const wrapper = mount(EditContentText, {
            props: {
                disabled: true,
                content: content.value,
            },
        });

        const textContent = wrapper.find("div[data-test='textContent']");

        expect(textContent.exists()).toBe(false);
    });
});
