import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { DocType, type AuthProviderDto } from "luminary-shared";
import IconSection from "./IconSection.vue";

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

const baseProvider: AuthProviderDto = {
    _id: "provider-1",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Acme Corp",
    domain: "acme.auth0.com",
    clientId: "client-1",
    audience: "https://api.acme.com",
};

const findUploadButton = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll("button").find((b) => b.text().trim() === "Upload");

describe("IconSection.vue", () => {
    afterEach(() => {
        mockImageBuckets.value = [];
    });

    // Regression coverage for issue #1578: with auto-select no longer mutating
    // the provider on mount, the gate must fall back to autoSelectImageBucket —
    // otherwise legacy single-bucket setups never show Upload.

    it("shows the upload button when a single bucket auto-selects (provider has no imageBucketId)", () => {
        mockImageBuckets.value = [SINGLE_BUCKET];
        const provider = reactive({ ...baseProvider, imageBucketId: undefined });

        const wrapper = mount(IconSection, {
            props: { provider, disabled: false },
        });

        expect(findUploadButton(wrapper)).toBeDefined();
    });

    it("shows the upload button when imageBucketId is explicitly set on the provider", () => {
        mockImageBuckets.value = [SINGLE_BUCKET, SECOND_BUCKET];
        const provider = reactive({ ...baseProvider, imageBucketId: SINGLE_BUCKET._id });

        const wrapper = mount(IconSection, {
            props: { provider, disabled: false },
        });

        expect(findUploadButton(wrapper)).toBeDefined();
    });

    it("hides the upload button when no buckets are configured", () => {
        mockImageBuckets.value = [];
        const provider = reactive({ ...baseProvider, imageBucketId: undefined });

        const wrapper = mount(IconSection, {
            props: { provider, disabled: false },
        });

        expect(findUploadButton(wrapper)).toBeUndefined();
    });

    it("hides the upload button when multiple buckets exist but none is selected", () => {
        mockImageBuckets.value = [SINGLE_BUCKET, SECOND_BUCKET];
        const provider = reactive({ ...baseProvider, imageBucketId: undefined });

        const wrapper = mount(IconSection, {
            props: { provider, disabled: false },
        });

        expect(findUploadButton(wrapper)).toBeUndefined();
    });
});
