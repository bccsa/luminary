import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import EditContentImage from "./EditContentImage.vue";
import { DocType, TagType, type TagDto } from "luminary-shared";
import { ref } from "vue";

// Reactive bucket list shared by all tests; each test sets it as needed.
const mockImageBuckets = vi.hoisted(() => {
    const { ref: _ref } = require("vue");
    return _ref<any[]>([]);
});

vi.mock("@/composables/storageSelection", () => {
    const { computed: _computed, ref: _ref } = require("vue");
    return {
        storageSelection: () => ({
            buckets: mockImageBuckets,
            imageBuckets: mockImageBuckets,
            mediaBuckets: _ref([]),
            getBucketById: (id: string | null) =>
                id ? mockImageBuckets.value.find((b: any) => b._id === id) || null : null,
            hasImageBuckets: _computed(() => mockImageBuckets.value.length > 0),
            hasMediaBuckets: _ref(false),
            autoSelectImageBucket: _computed(() =>
                mockImageBuckets.value.length === 1 ? mockImageBuckets.value[0]._id : null,
            ),
            autoSelectMediaBucket: _ref(null),
            needsImageBucketSelection: _computed(() => mockImageBuckets.value.length > 1),
            needsMediaBucketSelection: _ref(false),
            selectedImageBucket: _ref(undefined),
            selectedMediaBucket: _ref(undefined),
        }),
    };
});

const SINGLE_BUCKET = {
    _id: "bucket-images",
    name: "Image Storage",
    publicUrl: "http://localhost:9000/images",
    storageType: "image",
    mimeTypes: ["image/*"],
};
const SECOND_BUCKET = {
    _id: "bucket-archive",
    name: "Archive Storage",
    publicUrl: "http://localhost:9000/archive",
    storageType: "image",
    mimeTypes: ["image/*"],
};

const findUploadButton = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll("button").find((b) => b.text().includes("Upload"));

describe("EditContentImage.vue", () => {
    afterEach(() => {
        mockImageBuckets.value = [];
    });

    it("can display an image thumbnail", async () => {
        mockImageBuckets.value = [SINGLE_BUCKET];
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

    // Regression coverage for issue #1578: after the bucket auto-select stopped
    // mutating the parent on mount, the gate had to fall back to the auto-selected
    // bucket — otherwise legacy single-bucket setups never showed Upload.

    it("shows the upload button when a single bucket auto-selects (parent has no imageBucketId)", () => {
        mockImageBuckets.value = [SINGLE_BUCKET];
        const parent: TagDto = { ...mockData.mockCategoryDto, imageBucketId: undefined };

        const wrapper = mount(EditContentImage, {
            props: {
                docType: DocType.Tag,
                parent,
                tagOrPostType: TagType.Category,
                disabled: false,
                embedded: true,
            },
        });

        expect(findUploadButton(wrapper)).toBeDefined();
    });

    it("shows the upload button when imageBucketId is explicitly set on the parent", () => {
        mockImageBuckets.value = [SINGLE_BUCKET, SECOND_BUCKET];
        const parent: TagDto = {
            ...mockData.mockCategoryDto,
            imageBucketId: SINGLE_BUCKET._id,
        };

        const wrapper = mount(EditContentImage, {
            props: {
                docType: DocType.Tag,
                parent,
                tagOrPostType: TagType.Category,
                disabled: false,
                embedded: true,
            },
        });

        expect(findUploadButton(wrapper)).toBeDefined();
    });

    it("hides the upload button when no buckets are configured", () => {
        mockImageBuckets.value = [];
        const parent: TagDto = { ...mockData.mockCategoryDto, imageBucketId: undefined };

        const wrapper = mount(EditContentImage, {
            props: {
                docType: DocType.Tag,
                parent,
                tagOrPostType: TagType.Category,
                disabled: false,
                embedded: true,
            },
        });

        expect(findUploadButton(wrapper)).toBeUndefined();
    });

    it("hides the upload button when multiple buckets exist but none is selected", () => {
        mockImageBuckets.value = [SINGLE_BUCKET, SECOND_BUCKET];
        const parent: TagDto = { ...mockData.mockCategoryDto, imageBucketId: undefined };

        const wrapper = mount(EditContentImage, {
            props: {
                docType: DocType.Tag,
                parent,
                tagOrPostType: TagType.Category,
                disabled: false,
                embedded: true,
            },
        });

        expect(findUploadButton(wrapper)).toBeUndefined();
    });

    it("shows the upload button in the LCard actions slot when newDocument expands the card", () => {
        mockImageBuckets.value = [SINGLE_BUCKET];
        const parent: TagDto = { ...mockData.mockCategoryDto, imageBucketId: undefined };

        const wrapper = mount(EditContentImage, {
            props: {
                docType: DocType.Tag,
                parent,
                tagOrPostType: TagType.Category,
                disabled: false,
                newDocument: true,
            },
        });

        expect(findUploadButton(wrapper)).toBeDefined();
    });
});
