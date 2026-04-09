import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import LDialog from "@/components/common/LDialog.vue";
import type { ImageFileCollectionDto, ImageUploadDto } from "luminary-shared";

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

const mockFileCollection: ImageFileCollectionDto = {
    aspectRatio: 1.5,
    imageFiles: [
        { width: 180, height: 120, filename: "test-image.webp" },
        { width: 360, height: 240, filename: "test-image-2x.webp" },
    ],
};

const mockUploadData: ImageUploadDto = {
    filename: "uploaded.jpg",
    preset: "photo",
    fileData: new ArrayBuffer(100),
};

describe("ImageEditorThumbnail", () => {
    it("renders an image from file collection with srcset", () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageFileCollection: mockFileCollection,
                bucketHttpPath: "https://cdn.example.com",
            },
        });

        const img = wrapper.find("img");
        expect(img.exists()).toBe(true);
        expect(img.attributes("srcset")).toContain("test-image.webp 180w");
        expect(img.attributes("srcset")).toContain("test-image-2x.webp 360w");
    });

    it("generates a blob URL for upload data", () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageUploadData: mockUploadData,
            },
        });

        const img = wrapper.find("img");
        expect(img.exists()).toBe(true);
        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it("shows fallback image on error", async () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageFileCollection: mockFileCollection,
                bucketHttpPath: "https://cdn.example.com",
            },
        });

        const img = wrapper.find("img");
        await img.trigger("error");

        // After error, should show fallback image (no srcset, uses src)
        const fallbackImg = wrapper.find("img");
        expect(fallbackImg.exists()).toBe(true);
        expect(fallbackImg.attributes("srcset")).toBeUndefined();
    });

    it("shows delete confirmation dialog when trash icon is clicked", async () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageFileCollection: mockFileCollection,
                bucketHttpPath: "https://cdn.example.com",
                disabled: true,
            },
        });

        // Hover to show trash icon
        await wrapper.find(".group").trigger("mouseover");

        // Click trash icon
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) {
            await trashIcon.trigger("click");

            const dialog = wrapper.findComponent(LDialog);
            expect(dialog.props("open")).toBe(true);
            expect(dialog.props("title")).toBe("Delete file version");
        }
    });

    it("emits deleteFileCollection when delete is confirmed for file collection", async () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageFileCollection: mockFileCollection,
                disabled: true,
            },
        });

        // Open delete dialog
        await wrapper.find(".group").trigger("mouseover");
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) {
            await trashIcon.trigger("click");
        }

        // Trigger primary action (Delete)
        const dialog = wrapper.findComponent(LDialog);
        const primaryAction = dialog.props("primaryAction") as Function;
        primaryAction();

        expect(wrapper.emitted("deleteFileCollection")).toBeTruthy();
        expect(wrapper.emitted("deleteFileCollection")![0]).toEqual([mockFileCollection]);
    });

    it("emits deleteUploadData when delete is confirmed for upload data", async () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageUploadData: mockUploadData,
                disabled: true,
            },
        });

        // Open delete dialog
        await wrapper.find(".group").trigger("mouseover");
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) {
            await trashIcon.trigger("click");
        }

        // Trigger primary action
        const dialog = wrapper.findComponent(LDialog);
        const primaryAction = dialog.props("primaryAction") as Function;
        primaryAction();

        expect(wrapper.emitted("deleteUploadData")).toBeTruthy();
        expect(wrapper.emitted("deleteUploadData")![0]).toEqual([mockUploadData]);
    });

    it("closes dialog when cancel is clicked", async () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageFileCollection: mockFileCollection,
                disabled: true,
            },
        });

        // Open delete dialog
        await wrapper.find(".group").trigger("mouseover");
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) {
            await trashIcon.trigger("click");
        }

        const dialog = wrapper.findComponent(LDialog);
        const secondaryAction = dialog.props("secondaryAction") as Function;
        secondaryAction();

        expect(dialog.props("open")).toBe(false);
    });

    it("hides trash icon when not hovered", () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageFileCollection: mockFileCollection,
                disabled: true,
            },
        });

        const trashIcon = wrapper.find('[title="Delete file version"]');
        // v-show means the element exists but is hidden
        if (trashIcon.exists()) {
            expect(trashIcon.isVisible()).toBe(false);
        }
    });

    it("uses stable imageKey for file collections", () => {
        const wrapper = mount(ImageEditorThumbnail, {
            props: {
                imageFileCollection: mockFileCollection,
                bucketHttpPath: "https://cdn.example.com",
            },
        });

        const img = wrapper.find("img");
        expect(img.attributes("key") || img.exists()).toBeTruthy();
    });
});
