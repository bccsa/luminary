import "fake-indexeddb/auto";
import { describe, vi, beforeAll, afterAll, it, expect } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { accessMap, type ContentDto } from "luminary-shared";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import EditContentText from "./EditContentText.vue";
import waitForExpect from "wait-for-expect";

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
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
});
