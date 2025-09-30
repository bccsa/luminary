import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import EditContentMedia from "./EditContentMedia.vue";
import { DocType, TagType, type TagDto, MediaType, MediaPreset } from "luminary-shared";

// Mock browser APIs for MediaEditorThumbnail component
global.URL.createObjectURL = vi.fn(() => "mocked-url");
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader
class MockFileReader {
    onload: ((event: any) => void) | null = null;
    result: string | null = null;

    readAsDataURL(file: File) {
        setTimeout(() => {
            this.result = `data:audio/mp3;base64,mock-base64-${file.name}`;
            if (this.onload) {
                this.onload({ target: this });
            }
        }, 10);
    }
}
global.FileReader = MockFileReader as any;

// Mock showPicker for HTMLInputElement
HTMLInputElement.prototype.showPicker = vi.fn();

describe("EditContentMedia.vue", () => {
    let parent: TagDto;

    beforeEach(() => {
        parent = { ...mockData.mockCategoryDto };
    });

    const mountComponent = (selectedLanguageId?: string, newDocument = false) => {
        return mount(EditContentMedia, {
            props: {
                docType: DocType.Tag,
                tagOrPostType: TagType.Category,
                disabled: false,
                selectedLanguageId,
                newDocument, // Set to true to expand the card by default
                parent: parent,
                "onUpdate:parent": (newParent: any) => {
                    parent = newParent;
                },
            },
        });
    };

    it("displays 'Upload' button when no media exists for the current language", async () => {
        const wrapper = mountComponent("lang-123", true); // newDocument: true to expand card
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Upload");
    });

    it("displays 'Replace' button when media exists for the current language", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio.mp3",
                    languageId: "lang-123",
                    filename: "test-audio",
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
            ],
            uploadData: [],
        };

        const wrapper = mountComponent("lang-123", true);
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Replace");
    });

    it("displays 'Upload' button when media exists for different language", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio.mp3",
                    languageId: "lang-456", // Different language
                    filename: "test-audio",
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
            ],
            uploadData: [],
        };

        const wrapper = mountComponent("lang-123", true);
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Upload");
    });

    it("displays 'Replace' button when upload data exists for the current language", async () => {
        parent.media = {
            fileCollections: [],
            uploadData: [
                {
                    fileData: new ArrayBuffer(8),
                    languageId: "lang-123",
                    preset: MediaPreset.Default,
                    mediaType: MediaType.Audio,
                    filename: "test-audio",
                },
            ],
        };

        const wrapper = mountComponent("lang-123", true);
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Replace");
    });

    it("shows help text about single file per language when help is toggled", async () => {
        const wrapper = mountComponent("lang-123", true);

        // Find the help button (should be the button that's not the upload button or collapse button)
        const buttons = wrapper.findAll("button");
        let helpButton;

        for (const button of buttons) {
            // Skip the upload button and collapse button
            if (
                !button.attributes("data-test") &&
                button.html().includes("cursor-pointer") &&
                !button.html().includes("collapse-button")
            ) {
                helpButton = button;
                break;
            }
        }

        expect(helpButton).toBeDefined();
        await helpButton!.trigger("click");

        expect(wrapper.text()).toContain("You can upload one audio file per language");
        expect(wrapper.text()).toContain("replace any existing audio file");
    });

    it("handles file input correctly when no language is selected", async () => {
        const wrapper = mountComponent(undefined, true); // No selectedLanguageId, but expand card
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Upload");
    });

    it("file input does not allow multiple files", async () => {
        const wrapper = mountComponent("lang-123", true);
        const fileInput = wrapper.find('input[type="file"]');
        expect(fileInput.exists()).toBe(true);
        expect(fileInput.attributes("multiple")).toBeUndefined();
    });

    it("shows correct help text about single file per language limitation", async () => {
        const wrapper = mountComponent("lang-123", true);

        // Find the help button (should be the button that's not the upload button or collapse button)
        const buttons = wrapper.findAll("button");
        let helpButton;

        for (const button of buttons) {
            // Skip the upload button and collapse button
            if (
                !button.attributes("data-test") &&
                button.html().includes("cursor-pointer") &&
                !button.html().includes("collapse-button")
            ) {
                helpButton = button;
                break;
            }
        }

        expect(helpButton).toBeDefined();
        await helpButton!.trigger("click");

        expect(wrapper.text()).toContain("one audio file per language translation");
        expect(wrapper.text()).toContain("replace any existing audio file");
    });
});
