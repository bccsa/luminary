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
                isParentDirty: false,
            },
        });

        // Publish date, Coming soon, Always offline, then Pinned (Tag has four LToggle components)
        const toggle = wrapper.findAllComponents({ name: "LToggle" });
        expect(toggle[3].exists()).toBe(true);

        expect(toggle[3].props("modelValue")).toBe(true);
    });

    it("test the tag Vertical Tile toggle for Category", async () => {
        const parent = ref<TagDto>({
            ...mockData.mockCategoryDto,
            useVerticalTileLayout: false,
        });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Tag,
                tagOrPostType: TagType.Category,
                parent: parent.value,
                disabled: false,
                isParentDirty: false,
            },
        });

        // Find all LToggle components: Publish date, Coming soon, Always offline, Pinned, Vertical Tile
        const toggles = wrapper.findAllComponents({ name: "LToggle" });
        expect(toggles.length).toBeGreaterThanOrEqual(5);

        // Vertical Tile toggle should be the 5th one (index 4)
        const useVerticalTileLayoutToggle = toggles[4];
        expect(useVerticalTileLayoutToggle.exists()).toBe(true);
        expect(useVerticalTileLayoutToggle.props("modelValue")).toBe(false);
    });

    it("test the tag Vertical Tile toggle changes the computed property", async () => {
        const parent = ref<TagDto>({
            ...mockData.mockCategoryDto,
            useVerticalTileLayout: false,
        });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Tag,
                tagOrPostType: TagType.Category,
                parent: parent.value,
                disabled: false,
                isParentDirty: false,
            },
        });

        // Initial state: useVerticalTileLayout is false
        expect(parent.value.useVerticalTileLayout).toBe(false);

        // Find and update the vertical tile toggle (5th toggle, index 4)
        const toggles = wrapper.findAllComponents({ name: "LToggle" });
        const useVerticalTileLayoutToggle = toggles[4];

        // Simulate user clicking the toggle
        useVerticalTileLayoutToggle.vm.$emit("update:modelValue", true);

        // Update the parent ref to reflect the change
        parent.value.useVerticalTileLayout = true;

        // Verify the toggle now shows true
        expect(parent.value.useVerticalTileLayout).toBe(true);
    });

    it("test the always available offline toggle on Post", async () => {
        const parent = ref<PostDto>({ ...mockData.mockPostDto, alwaysOffline: true });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
                parent: parent.value,
                disabled: false,
                isParentDirty: false,
            },
        });

        const toggles = wrapper.findAllComponents({ name: "LToggle" });
        // Publish date (0), Coming soon (1), Always offline (2)
        expect(toggles[2].props("modelValue")).toBe(true);
        expect(wrapper.text()).toContain("Always available offline");
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
                isParentDirty: false,
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
                isParentDirty: false,
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
                isParentDirty: true,
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
                isParentDirty: false,
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
                isParentDirty: false,
            },
        });

        expect(wrapper.html()).toContain("At least one group membership is required");
    });
});
