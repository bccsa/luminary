import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { fullAccessToAllContentMap, mockEnglishContentDto } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import type { ContentDto } from "@/types";
import EditContentText from "./EditContentText.vue";

describe("EditContentPreview.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("does not display text when not defined", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
        const wrapper = mount(EditContentText, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        expect(wrapper.html()).not.toContain(content.value.text);
    });

    it("display text, when is defined", async () => {
        const content = ref<ContentDto>(mockEnglishContentDto);
        const wrapper = mount(EditContentText, {
            props: {
                disabled: true,
                content: content.value,
            },
        });

        const textContent = wrapper.find('div[data-test="textContent"]');
        expect(textContent.exists()).toBe(true);

        expect(textContent).toBeTruthy();
    });
});
