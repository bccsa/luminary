import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import EditContentParent from "./EditContentParent.vue";
import { DocType, type PostDto, type TagDto, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { ref } from "vue";

describe("EditContentParent.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    it("test the tag pinned toggle", async () => {
        const parent = ref<TagDto>({ ...mockData.mockCategoryDto, pinned: true });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Tag,
                modelValue: parent.value,
            },
        });

        // // Check if the LToggle component is rendered
        const toggle = wrapper.findComponent({ name: "LToggle" });
        expect(toggle.exists()).toBe(true);

        expect(toggle.props("modelValue")).toBe(true);
    });

    it("test the show publishDate toggle", async () => {
        const parent = ref<PostDto | TagDto>({
            ...mockData.mockPostDto,
            publishDateVisible: false,
        });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                modelValue: parent.value,
                language: mockData.mockLanguageDtoEng,
            },
        });

        // Check if the LToggle component is rendered
        const toggle = wrapper.findComponent({ name: "LToggle" });
        expect(toggle.exists()).toBe(true);

        expect(toggle.props("modelValue")).toBe(false);
    });

    it("can display an image thumbnail", async () => {
        const parent = ref<TagDto>({ ...mockData.mockCategoryDto });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Tag,
                modelValue: parent.value,
            },
        });

        expect(wrapper.html()).toContain("test-image.webp");
    });

    it("test to see if Category and selected tags are displayed", async () => {
        const parent = ref<PostDto>({ ...mockData.mockPostDto, tags: ["tag-category1"] });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                modelValue: parent.value,
                language: mockData.mockLanguageDtoEng,
            },
        });

        expect(wrapper.text()).toContain("Categories");
        expect(wrapper.text()).toContain("Topics");
        expect(wrapper.text()).toContain("Audio Playlists");

        // TODO: Check why the selected categories are not displayed
    });

    it("enables the post editing components when no groups are set", async () => {
        const parent = ref<PostDto>({ ...mockData.mockPostDto, memberOf: [] });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                modelValue: parent.value,
                language: mockData.mockLanguageDtoEng,
            },
        });

        // Check if the "show publish date" toggle is not disabled
        const toggle = wrapper.findComponent({ name: "LToggle" });
        expect(toggle.props().disabled).toBeFalsy();
    });

    it("disables the post editing components when the user does not have access to one of the groups", async () => {
        const parent = ref<PostDto>({
            ...mockData.mockPostDto,
            memberOf: ["group-public-content", "a-group-to-which-the-user-does-not-have-access"],
        });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                modelValue: parent.value,
                language: mockData.mockLanguageDtoEng,
            },
        });

        // Check if the "show publish date" toggle is disabled
        const toggle = wrapper.findComponent({ name: "LToggle" });
        expect(toggle.props().disabled).toBeTruthy();
    });
});
