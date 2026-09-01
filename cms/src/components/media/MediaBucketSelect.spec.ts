import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import * as mockData from "@/tests/mockdata";
import MediaBucketSelect from "./MediaBucketSelect.vue";
import { type ContentParentDto } from "luminary-shared";

const mockMediaBuckets = vi.hoisted(() => {
    const { ref } = require("vue");
    return ref([
        {
            _id: "bucket-media",
            name: "Media Storage",
            publicUrl: "http://localhost:9000/media",
            storageType: "media",
        },
    ]);
});

vi.mock("@/composables/storageSelection", () => {
    const { ref: _ref, computed: _computed } = require("vue");
    return {
        storageSelection: () => ({
            imageBuckets: _ref([]),
            mediaBuckets: mockMediaBuckets,
            getBucketById: (id: string | null) =>
                id ? mockMediaBuckets.value.find((b: any) => b._id === id) || null : null,
            hasImageBuckets: _ref(false),
            hasMediaBuckets: _computed(() => mockMediaBuckets.value.length > 0),
            autoSelectImageBucket: _ref(null),
            autoSelectMediaBucket: _computed(() =>
                mockMediaBuckets.value.length === 1 ? mockMediaBuckets.value[0]._id : null,
            ),
        }),
    };
});

const ONE_BUCKET = [mockMediaBuckets.value[0]];
const TWO_BUCKETS = [
    mockMediaBuckets.value[0],
    { _id: "bucket-media-2", name: "Second bucket", storageType: "media" },
];

describe("MediaBucketSelect", () => {
    let parent: ContentParentDto;

    beforeEach(() => {
        parent = { ...mockData.mockCategoryDto };
        mockMediaBuckets.value = ONE_BUCKET;
    });

    const mountSelect = () => mount(MediaBucketSelect, { props: { parent, disabled: false } });

    it("hides the selector when there is only one bucket", () => {
        expect(mountSelect().find('[data-test="bucket-select"]').exists()).toBe(false);
    });

    it("names the bucket it will encode into, which nothing said before", () => {
        expect(mountSelect().find('[data-test="bucket-single"]').text()).toContain("Media Storage");
    });

    it("offers a selector when there is more than one", () => {
        mockMediaBuckets.value = TWO_BUCKETS;

        expect(mountSelect().find('[data-test="bucket-select"]').exists()).toBe(true);
    });

    it("auto-selects a single bucket without dirtying the document", () => {
        mountSelect();

        // Writing it here would mark an untouched legacy document as edited.
        expect(parent.mediaBucketId).toBeUndefined();
    });

    it("clears a bucket that no longer exists", async () => {
        parent.mediaBucketId = "bucket-that-was-deleted";

        mountSelect();
        await new Promise((r) => setTimeout(r, 0));

        expect(parent.mediaBucketId).toBeUndefined();
    });

    it("warns when several buckets exist and none is chosen", async () => {
        mockMediaBuckets.value = TWO_BUCKETS;
        const wrapper = mountSelect();
        await nextTick();

        expect(wrapper.find('[data-test="bucket-problem"]').text()).toContain(
            "Choose a storage bucket",
        );
    });

    it("warns when no buckets are configured at all", async () => {
        mockMediaBuckets.value = [];
        const wrapper = mountSelect();
        await nextTick();

        expect(wrapper.find('[data-test="bucket-problem"]').text()).toContain(
            "No storage buckets are configured",
        );
    });

    it("says nothing when a bucket is settled", async () => {
        const wrapper = mountSelect();
        await nextTick();

        expect(wrapper.find('[data-test="bucket-problem"]').exists()).toBe(false);
    });
});
