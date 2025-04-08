import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import EditContentParent from "./EditContentParent.vue";
import { DocType, type PostDto, PostType, type TagDto, TagType, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { ref } from "vue";

describe("EditContentParent.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterEach(async () => {});

    it("test the tag pinned toggle", async () => {
        const parent = ref<TagDto>({ ...mockData.mockCategoryDto, pinned: 1 });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Tag,
                tagOrPostType: TagType.Category,
                parent: parent.value,
                disabled: false,
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
                tagOrPostType: PostType.Blog,
                parent: parent.value,
                language: mockData.mockLanguageDtoEng,
                disabled: false,
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
                parent: parent.value,
                tagOrPostType: TagType.Category,
                modelValue: parent.value,
                disabled: false,
            },
        });

        expect(wrapper.html()).toContain("test-image.webp");
    });

    it("test to see if Category and selected tags are displayed", async () => {
        const parent = ref<PostDto>({ ...mockData.mockPostDto, tags: ["tag-category1"] });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
                parent: parent.value,
                modelValue: parent.value,
                language: mockData.mockLanguageDtoEng,
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("Categories");
        expect(wrapper.text()).toContain("Topics");
        expect(wrapper.text()).toContain("Audio Playlists");

        // TODO: Check why the selected categories are not displayed
    });
});
