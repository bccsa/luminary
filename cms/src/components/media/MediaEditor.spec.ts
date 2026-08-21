import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import * as mockData from "@/tests/mockdata";
import MediaEditor from "./MediaEditor.vue";
import { MediaType, type ContentParentDto, db } from "luminary-shared";

// Mock storageSelection composable
const mockMediaBuckets = vi.hoisted(() => {
    const { ref } = require("vue");
    return ref([
        {
            _id: "bucket-media",
            name: "Media Storage",
            publicUrl: "http://localhost:9000/media",
            storageType: "media",
            mimeTypes: ["audio/*"],
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

vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        cmsLanguageIdAsRef: ref("lang-eng"),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});

const ONE_BUCKET = [mockMediaBuckets.value[0]];
const TWO_BUCKETS = [
    mockMediaBuckets.value[0],
    {
        _id: "bucket-media-2",
        name: "Second bucket",
        publicUrl: "http://localhost:9000/media2",
        storageType: "media",
        mimeTypes: ["audio/*"],
    },
];

describe("MediaEditor.vue", () => {
    let parent: ContentParentDto;

    beforeEach(async () => {
        parent = { ...mockData.mockCategoryDto };
        mockMediaBuckets.value = ONE_BUCKET;

        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    const mountEditor = () => mount(MediaEditor, { props: { parent, disabled: false } });

    describe("existing audio", () => {
        it("says so when the document has none", async () => {
            expect(mountEditor().text()).toContain("No audio files");
        });

        it("lists audio the document already carries", async () => {
            parent.media = {
                fileCollections: [
                    {
                        languageId: "lang-eng",
                        fileUrl: "http://localhost:9000/media/audio.mp3",
                        bitrate: 128,
                        mediaType: MediaType.Audio,
                    },
                ],
            };

            const wrapper = mountEditor();

            expect(wrapper.find('[data-test="thumbnail-area"]').exists()).toBe(true);
        });

        it("treats an empty collection list as no media", async () => {
            parent.media = { fileCollections: [] };

            expect(mountEditor().find('[data-test="no-media-message"]').exists()).toBe(true);
        });
    });

    describe("uploading", () => {
        it("offers no way to upload — media comes from the encoder", async () => {
            parent.media = { fileCollections: [] };
            const wrapper = mountEditor();

            // The CMS no longer processes uploads: the API dropped the pipeline, so a
            // file picker here would produce data nothing acts on.
            expect(wrapper.find("input[type='file']").exists()).toBe(false);
            expect(wrapper.find('[data-test="audio-upload"]').exists()).toBe(false);
            expect(wrapper.text().toLowerCase()).not.toContain("drop your files");
        });
    });

    describe("bucket selection", () => {
        it("hides the selector when there is only one bucket", async () => {
            expect(mountEditor().find('[data-test="bucket-select"]').exists()).toBe(false);
        });

        it("offers a selector when there is more than one", async () => {
            mockMediaBuckets.value = TWO_BUCKETS;

            expect(mountEditor().find('[data-test="bucket-select"]').exists()).toBe(true);
        });

        it("auto-selects a single bucket without dirtying the document", async () => {
            mountEditor();

            // Writing it here would mark an untouched legacy document as edited.
            expect(parent.mediaBucketId).toBeUndefined();
        });

        it("clears a bucket that no longer exists", async () => {
            parent.mediaBucketId = "bucket-that-was-deleted";

            mountEditor();
            await new Promise((r) => setTimeout(r, 0));

            expect(parent.mediaBucketId).toBeUndefined();
        });

        it("warns when several buckets exist and none is chosen", async () => {
            mockMediaBuckets.value = TWO_BUCKETS;
            const wrapper = mountEditor();
            await nextTick();

            expect(wrapper.find('[data-test="failure-message"]').text()).toContain(
                "select a storage bucket",
            );
        });

        it("warns when no buckets are configured at all", async () => {
            mockMediaBuckets.value = [];
            const wrapper = mountEditor();
            await nextTick();

            expect(wrapper.find('[data-test="failure-message"]').text()).toContain(
                "No storage buckets configured",
            );
        });
    });
});
