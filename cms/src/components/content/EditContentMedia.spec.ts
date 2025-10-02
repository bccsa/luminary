import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import EditContentMedia from "./EditContentMedia.vue";
import { DocType, TagType, type TagDto, MediaType, MediaPreset, db } from "luminary-shared";

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

    beforeEach(async () => {
        parent = { ...mockData.mockCategoryDto };

        // Add test languages to the database
        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    const mountComponent = (newDocument = false) => {
        return mount(EditContentMedia, {
            props: {
                docType: DocType.Tag,
                tagOrPostType: TagType.Category,
                disabled: false,
                newDocument, // Set to true to expand the card by default
                parent: parent,
                "onUpdate:parent": (newParent: any) => {
                    parent = newParent;
                },
            },
        });
    };

    it("displays 'Upload' button when no media exists", async () => {
        const wrapper = mountComponent(true); // newDocument: true to expand card
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Upload");
    });

    it("displays 'Add' button when media exists", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio.mp3",
                    languageId: mockData.mockLanguageDtoEng._id,
                    filename: "test-audio",
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
            ],
            uploadData: [],
        };

        const wrapper = mountComponent(true);
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Add");
    });

    it("displays 'Add' button when upload data exists", async () => {
        parent.media = {
            fileCollections: [],
            uploadData: [
                {
                    fileData: new ArrayBuffer(8),
                    languageId: mockData.mockLanguageDtoEng._id,
                    preset: MediaPreset.Default,
                    mediaType: MediaType.Audio,
                    filename: "test-audio",
                },
            ],
        };

        const wrapper = mountComponent(true);
        const uploadButton = wrapper.find('[data-test="upload-button"]');
        expect(uploadButton.exists()).toBe(true);
        expect(uploadButton.text()).toContain("Add");
    });

    it("shows help text about multiple files with one per language when help is toggled", async () => {
        const wrapper = mountComponent(true);

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

        expect(wrapper.text()).toContain("You can upload multiple audio files, one per language");
        expect(wrapper.text()).toContain("Each language can have only one audio file");
    });

    it("file input does not allow multiple files", async () => {
        const wrapper = mountComponent(true);
        const fileInput = wrapper.find('input[type="file"]');
        expect(fileInput.exists()).toBe(true);
        expect(fileInput.attributes("multiple")).toBeUndefined();
    });

    it("shows correct help text about language-based upload", async () => {
        const wrapper = mountComponent(true);

        // Find the help button
        const buttons = wrapper.findAll("button");
        let helpButton;

        for (const button of buttons) {
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

        expect(wrapper.text()).toContain("one per language");
        expect(wrapper.text()).toContain("replace the existing file");
    });
});
