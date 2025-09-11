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
                existingContent: [],
                existingParent: mockData.mockPostDto,
            },
        });

        // Check if the LToggle component is rendered
        // There should be two toggles, one for pinned and one for publishDate
        const toggle = wrapper.findAllComponents({ name: "LToggle" });
        expect(toggle[1].exists()).toBe(true);

        expect(toggle[1].props("modelValue")).toBe(true);
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
                existingContent: [],
                existingParent: mockData.mockPostDto,
            },
        });

        // Check if the LToggle component is rendered
        const toggle = wrapper.findComponent({ name: "LToggle" });
        expect(toggle.exists()).toBe(true);

        expect(toggle.props("modelValue")).toBe(false);
    });

    it("test to see if Category and selected tags are displayed", async () => {
        const parent = ref<PostDto>({ ...mockData.mockPostDto, tags: ["tag-category1"] });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
                parent: parent.value,
                language: mockData.mockLanguageDtoEng,
                disabled: false,
                existingContent: [],
                existingParent: mockData.mockPostDto,
            },
        });

        expect(wrapper.text()).toContain("Categories");
        expect(wrapper.text()).toContain("Topics");

        // TODO: Check why the selected categories are not displayed
    });

    it("displays unsaved changes warning when there are changes", async () => {
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
                parent: { ...mockData.mockPostDto, memberOf: [] },
                language: mockData.mockLanguageDtoEng,
                disabled: false,
                existingContent: [],
                existingParent: mockData.mockPostDto,
            },
        });

        expect(wrapper.html()).toContain("Unsaved changes");
    });

    it("doesn't display warning when there are no changes", async () => {
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
                parent: mockData.mockPostDto,
                language: mockData.mockLanguageDtoEng,
                disabled: false,
                existingContent: [],
                existingParent: mockData.mockPostDto,
            },
        });

        expect(wrapper.html()).not.toContain("Unsaved changes");
    });

    it("fails validation if no groups are set", async () => {
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
                parent: { ...mockData.mockPostDto, memberOf: [] },
                language: mockData.mockLanguageDtoEng,
                disabled: false,
                existingContent: [],
                existingParent: mockData.mockPostDto,
            },
        });

        expect(wrapper.html()).toContain("At least one group membership is required");
    });
});
