import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import MediaEditor from "./MediaEditor.vue";
import { MediaType, type ContentParentDto, db } from "luminary-shared";
import LDialog from "../common/LDialog.vue";

// Mock browser APIs
global.URL.createObjectURL = vi.fn(() => "mocked-url");
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader with proper event handling
class MockFileReader {
    result: ArrayBuffer | null = null;
    onload: ((event: any) => void) | null = null;

    readAsArrayBuffer(file: File) {
        const buffer = new ArrayBuffer(file.size || 1024);
        this.result = buffer;
        if (this.onload) {
            this.onload({ target: { result: buffer } });
        }
    }
}
global.FileReader = MockFileReader as any;

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

describe("MediaEditor.vue", () => {
    let parent: ContentParentDto;

    beforeEach(async () => {
        parent = { ...mockData.mockCategoryDto };

        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("shows generic empty state message when no media exists", async () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("No audio files uploaded yet.");
    });

    it("shows thumbnail area when media exists", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio-fr.mp3",
                    languageId: mockData.mockLanguageDtoFra._id,
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
            ],
            uploadData: [],
        };

        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                disabled: false,
            },
        });

        const thumbnailArea = wrapper.find('[data-test="thumbnail-area"]');
        expect(thumbnailArea.exists()).toBe(true);
    });

    it("respects file input constraints", async () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                disabled: false,
            },
        });

        const fileInput = wrapper.find('[data-test="audio-upload"]');
        expect(fileInput.exists()).toBe(true);
        expect(fileInput.attributes("multiple")).toBeUndefined();
        expect(fileInput.attributes("accept")).toContain("audio/*");
    });

    it("shows empty message when media has empty fileCollections and no uploadData", async () => {
        parent.media = {
            fileCollections: [],
            uploadData: [],
        };

        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("No audio files uploaded yet.");
    });

    it("exposes handleFiles method", () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                disabled: false,
            },
        });

        expect((wrapper.vm as any).handleFiles).toBeDefined();
    });

    it("shows upload data thumbnails when uploadData exists", () => {
        parent.media = {
            fileCollections: [],
            uploadData: [
                {
                    languageId: mockData.mockLanguageDtoEng._id,
                    fileData: new ArrayBuffer(100),
                    filename: "test.mp3",
                    preset: "audio",
                },
            ],
        };

        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                disabled: false,
            },
        });

        const thumbnailArea = wrapper.find('[data-test="thumbnail-area"]');
        expect(thumbnailArea.exists()).toBe(true);
    });

    // New tests covering storageSelection and language selection

    it("handleFiles shows error when no bucket is selected", async () => {
        // Use multiple buckets so auto-select doesn't kick in
        const origBuckets = [...mockMediaBuckets.value];
        mockMediaBuckets.value = [
            ...origBuckets,
            { _id: "bucket-media-2", name: "Second Media", publicUrl: "http://test2.com", storageType: "media", mimeTypes: ["audio/*"] },
        ];

        parent.mediaBucketId = undefined;

        const wrapper = mount(MediaEditor, {
            props: { parent, disabled: false },
        });

        const mockFile = new File(["audio"], "test.mp3", { type: "audio/mp3" });
        const fileList = { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) };

        const component = wrapper.vm as any;
        component.handleFiles(fileList);
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("Please select a storage bucket");

        mockMediaBuckets.value = origBuckets;
    });

    it("handleFiles shows error when no buckets are configured", async () => {
        const origBuckets = [...mockMediaBuckets.value];
        mockMediaBuckets.value = [];
        parent.mediaBucketId = undefined;

        const wrapper = mount(MediaEditor, {
            props: { parent, disabled: false },
        });

        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain("No storage buckets configured");

        mockMediaBuckets.value = origBuckets;
    });

    it("handleFiles opens language selector when bucket is configured", async () => {
        parent.mediaBucketId = "bucket-media";
        parent.media = { fileCollections: [], uploadData: [] };

        const wrapper = mount(MediaEditor, {
            props: { parent, disabled: false },
        });

        const mockFile = new File(["audio"], "test.mp3", { type: "audio/mp3" });
        const fileList = { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) };

        const component = wrapper.vm as any;
        component.handleFiles(fileList);
        await wrapper.vm.$nextTick();

        // Language selector dialog should open
        const dialogs = wrapper.findAllComponents(LDialog);
        const languageDialog = dialogs.find((d) => d.props("title") === "Select Language for Audio");
        expect(languageDialog).toBeDefined();
        expect(languageDialog?.props("open")).toBe(true);
    });

    it("cancelLanguageSelection resets state", async () => {
        parent.mediaBucketId = "bucket-media";
        parent.media = { fileCollections: [], uploadData: [] };

        const wrapper = mount(MediaEditor, {
            props: { parent, disabled: false },
        });

        // Open language selector
        const mockFile = new File(["audio"], "test.mp3", { type: "audio/mp3" });
        const fileList = { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) };

        const component = wrapper.vm as any;
        component.handleFiles(fileList);
        await wrapper.vm.$nextTick();

        // Cancel
        const dialogs = wrapper.findAllComponents(LDialog);
        const languageDialog = dialogs.find((d) => d.props("title") === "Select Language for Audio");
        const cancelAction = languageDialog?.props("secondaryAction") as Function;
        cancelAction();
        await wrapper.vm.$nextTick();

        expect(languageDialog?.props("open")).toBe(false);
    });

    it("auto-selects bucket when only one is available", () => {
        parent.mediaBucketId = undefined;

        mount(MediaEditor, {
            props: { parent, disabled: false },
        });

        expect(parent.mediaBucketId).toBe("bucket-media");
    });

    it("language selector has a select element for choosing language", async () => {
        parent.mediaBucketId = "bucket-media";
        parent.media = { fileCollections: [], uploadData: [] };

        const wrapper = mount(MediaEditor, {
            props: { parent, disabled: false },
        });

        // Open language selector
        const mockFile = new File(["audio"], "test.mp3", { type: "audio/mp3" });
        const fileList = { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) };

        const component = wrapper.vm as any;
        component.handleFiles(fileList);
        await wrapper.vm.$nextTick();

        // Language select should be present in the dialog
        const selects = wrapper.findAll("#language-select");
        expect(selects.length).toBeGreaterThan(0);
    });
});
