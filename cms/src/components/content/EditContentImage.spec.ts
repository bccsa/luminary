import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import EditContentImage from "./EditContentImage.vue";
import { DocType, TagType, type TagDto } from "luminary-shared";
import { ref } from "vue";

describe("EditContentValidation.vue", () => {
    it("can display an image thumbnail", async () => {
        const parent = ref<TagDto>({ ...mockData.mockCategoryDto });
        const wrapper = mount(EditContentImage, {
            props: {
                docType: DocType.Tag,
                parent: parent.value,
                tagOrPostType: TagType.Category,
                disabled: false,
            },
        });

        expect(wrapper.html()).toContain("test-image.webp");
    });

    it("shows warning when no bucket is selected", async () => {
        const parent = ref<TagDto>({ ...mockData.mockCategoryDto, imageBucketId: undefined });
        const wrapper = mount(EditContentImage, {
            props: {
                docType: DocType.Tag,
                parent: parent.value,
                tagOrPostType: TagType.Category,
                disabled: false,
            },
        });

        expect(wrapper.html()).toContain("Please select a storage bucket first.");
    });
});
