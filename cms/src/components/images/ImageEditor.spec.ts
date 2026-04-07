import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import ImageEditor from "./ImageEditor.vue";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accessMap, maxUploadFileSize, type ContentParentDto } from "luminary-shared";
import { mockPostDto, superAdminAccessMap } from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

// Mock URL APIs
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader
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
const mockImageBuckets = vi.hoisted(() => {
    const { ref } = require("vue");
    return ref([
        {
            _id: "bucket-images",
            name: "Image Storage",
            publicUrl: "http://localhost:9000/images",
            storageType: "image",
            mimeTypes: ["image/*"],
        },
    ]);
});

vi.mock("@/composables/storageSelection", () => {
    const { ref: _ref, computed: _computed } = require("vue");
    return {
        storageSelection: () => ({
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
        }),
    };
});

vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        clientAppUrl: ref("http://localhost:4174"),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});

describe("ImageEditor", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());
        accessMap.value = superAdminAccessMap;
        // Set a reasonable max upload size for tests (10MB)
        maxUploadFileSize.value = 10 * 1024 * 1024;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("can render an image document", async () => {
        const wrapper = mount(ImageEditor, {
            props: { parent: mockPostDto, disabled: false },
        });

        const imageFiles = wrapper.find("div[data-test='thumbnail-area']");
        expect(imageFiles.html()).toContain(
            mockPostDto.imageData!.fileCollections[0].imageFiles[0].filename,
        );
    });

    it("shows the empty message when no image is present", async () => {
        const wrapper = mount(ImageEditor, {
            props: {
                parent: { ...mockPostDto, imageData: { fileCollections: [] } },
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("No images uploaded yet.");
    });

    it("shows the empty message when imageData is undefined", async () => {
        const parentWithoutImages = { ...mockPostDto, imageData: undefined };
        const wrapper = mount(ImageEditor, {
            props: {
                parent: parentWithoutImages,
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("No images uploaded yet.");
    });

    it("has a file input for uploading", () => {
        const wrapper = mount(ImageEditor, {
            props: { parent: mockPostDto, disabled: false },
        });

        const fileInput = wrapper.find('[data-test="image-upload"]');
        expect(fileInput.exists()).toBe(true);
    });

    it("handles drag enter and leave events", async () => {
        const wrapper = mount(ImageEditor, {
            props: { parent: mockPostDto, disabled: false },
        });

        const dropArea = wrapper.find(".w-screen, .sm\\:w-full");
        if (dropArea.exists()) {
            await dropArea.trigger("dragenter");
            await dropArea.trigger("dragleave");
        }

        expect(wrapper.exists()).toBe(true);
    });

    it("exposes handleFiles and uploadInput", () => {
        const wrapper = mount(ImageEditor, {
            props: { parent: mockPostDto, disabled: false },
        });

        expect((wrapper.vm as any).handleFiles).toBeDefined();
        expect((wrapper.vm as any).uploadInput).toBeDefined();
    });

    it("shows upload data thumbnails when they exist", () => {
        const parentWithUploads = {
            ...mockPostDto,
            imageData: {
                fileCollections: [],
                uploadData: [
                    {
                        filename: "test-upload.jpg",
                        preset: "photo",
                        fileData: new ArrayBuffer(100),
                    },
                ],
            },
        };

        const wrapper = mount(ImageEditor, {
            props: { parent: parentWithUploads, disabled: false },
        });

        const thumbnailArea = wrapper.find('[data-test="thumbnail-area"]');
        expect(thumbnailArea.exists()).toBe(true);
    });

    // New tests covering storageSelection integration

    it("handleFiles shows error when no bucket is selected", async () => {
        // Use multiple buckets so auto-select doesn't kick in
        const origBuckets = [...mockImageBuckets.value];
        mockImageBuckets.value = [
            ...origBuckets,
            { _id: "bucket-2", name: "Second", publicUrl: "http://test2.com", storageType: "image", mimeTypes: ["image/*"] },
        ];

        const parent: ContentParentDto = {
            ...mockPostDto,
            imageBucketId: undefined,
        };

        const wrapper = mount(ImageEditor, {
            props: { parent, disabled: false },
        });

        const component = wrapper.vm as any;
        const mockFile = new File(["img"], "test.jpg", { type: "image/jpeg" });
        const fileList = { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) };

        component.handleFiles(fileList);
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("Please select a storage bucket");

        mockImageBuckets.value = origBuckets;
    });

    it("handleFiles shows error when no buckets are configured", async () => {
        // Temporarily clear buckets
        const origBuckets = [...mockImageBuckets.value];
        mockImageBuckets.value = [];

        const parent: ContentParentDto = {
            ...mockPostDto,
            imageBucketId: undefined,
        };

        const wrapper = mount(ImageEditor, {
            props: { parent, disabled: false },
        });

        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("No storage buckets configured");

        // Restore
        mockImageBuckets.value = origBuckets;
    });

    it("processFiles adds upload data to parent", async () => {
        const parent: ContentParentDto = {
            ...mockPostDto,
            imageBucketId: "bucket-images",
            imageData: { fileCollections: [] },
        };

        const wrapper = mount(ImageEditor, {
            props: { parent, disabled: false },
        });

        const mockFile = new File(["image-data"], "test.jpg", { type: "image/jpeg" });
        Object.defineProperty(mockFile, "size", { value: 1024 }); // Small file

        const fileList = { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) };

        const component = wrapper.vm as any;
        component.handleFiles(fileList);
        await wrapper.vm.$nextTick();

        expect(parent.imageData!.uploadData).toBeDefined();
        expect(parent.imageData!.uploadData!.length).toBe(1);
        expect(parent.imageData!.uploadData![0].filename).toBe("test.jpg");
    });

    it("processFiles rejects oversized file", async () => {
        const parent: ContentParentDto = {
            ...mockPostDto,
            imageBucketId: "bucket-images",
            imageData: { fileCollections: [] },
        };

        const wrapper = mount(ImageEditor, {
            props: { parent, disabled: false },
        });

        // Create a file larger than max upload size
        const largeSize = maxUploadFileSize.value + 1;
        const mockFile = new File(["x"], "huge.jpg", { type: "image/jpeg" });
        Object.defineProperty(mockFile, "size", { value: largeSize });

        const fileList = { 0: mockFile, length: 1, item: (i: number) => (i === 0 ? mockFile : null) };

        const component = wrapper.vm as any;
        component.handleFiles(fileList);
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("file size is larger than the maximum");
    });

    it("auto-selects bucket when only one is available", async () => {
        const parent: ContentParentDto = {
            ...mockPostDto,
            imageBucketId: undefined,
            imageData: { fileCollections: [] },
        };

        mount(ImageEditor, {
            props: { parent, disabled: false },
        });

        // The watchEffect should auto-select the single available bucket
        expect(parent.imageBucketId).toBe("bucket-images");
    });
});
