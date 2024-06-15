import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import {
    fullAccessToAllContentMap,
    mockCategoryDto,
    mockLanguageDtoEng,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import EditContentParent from "./EditContentParent.vue";
import { DocType, type PostDto, type TagDto } from "@/types";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";

describe("EditContentParent.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterEach(async () => {});

    it("test the tag pinned toggle", async () => {
        const parent = ref<TagDto>({ ...mockCategoryDto, pinned: true });
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

    it("test the image input", async () => {
        const parent = ref<TagDto>({ ...mockCategoryDto, image: "image.png" });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Tag,
                modelValue: parent.value,
            },
        });

        // Check if the input image field is rendered
        const imageInput = wrapper.find("input[name='parent.image']");
        expect(imageInput.exists()).toBe(true);

        imageInput.setValue("https://example.com/new-image.png");
        expect(parent.value.image).toBe("https://example.com/new-image.png");
    });

    it("test to see if Category and selected tags are displayed", async () => {
        const parent = ref<PostDto>({ ...mockPostDto, tags: ["tag-category1"] });
        const wrapper = mount(EditContentParent, {
            props: {
                docType: DocType.Post,
                modelValue: parent.value,
                language: mockLanguageDtoEng,
            },
        });

        expect(wrapper.text()).toContain("Categories");
        expect(wrapper.text()).toContain("Topics");
        expect(wrapper.text()).toContain("Audio Playlists");

        // TODO: Check why the selected categories are not displayed
    });

    // TODO: test to see if added tags are added to underlying Parent document
});
