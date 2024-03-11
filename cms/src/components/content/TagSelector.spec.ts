import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { mockCategory, mockLanguageEng, mockTopic } from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useTagStore } from "@/stores/tag";
import TagSelector from "./TagSelector.vue";

describe("TagSelector", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const tagStore = useTagStore();
        tagStore.tags = [mockCategory, mockTopic];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays selected tags", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tags: [mockCategory, mockTopic],
                selectedTags: [mockCategory],
                language: mockLanguageEng,
            },
        });

        expect(wrapper.text()).toContain("Category 1");
        expect(wrapper.text()).not.toContain("Topic A");
    });

    it("displays all available tags", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tags: [mockCategory, mockTopic],
                selectedTags: [],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("button").trigger("click"); // First button is the dropdown button

        expect(wrapper.text()).toContain("Category 1");
        expect(wrapper.text()).toContain("Topic A");
    });

    it("can filter on tags", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tags: [mockCategory, mockTopic],
                selectedTags: [],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("input").setValue("cat");

        expect(wrapper.text()).toContain("Category 1");
        expect(wrapper.text()).not.toContain("Topic A");
    });

    it("emits an event when selecting a tag", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tags: [mockCategory, mockTopic],
                selectedTags: [],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("input").setValue("cat");
        await wrapper.find("li").trigger("click");

        const selectEvent: any = wrapper.emitted("select");
        expect(selectEvent).not.toBe(undefined);
        expect(selectEvent![0][0]).toEqual(mockCategory);
    });

    it("emits an event when removing a tag", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tags: [mockCategory, mockTopic],
                selectedTags: [mockCategory],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("button[data-test='removeTag']").trigger("click");

        const removeEvent: any = wrapper.emitted("remove");
        expect(removeEvent).not.toBe(undefined);
        expect(removeEvent![0][0]).toEqual(mockCategory);
    });
});
