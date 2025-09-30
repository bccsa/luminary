import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import MediaEditor from "./MediaEditor.vue";
import { MediaType, type ContentParentDto } from "luminary-shared";

// Mock browser APIs
global.URL.createObjectURL = vi.fn(() => "mocked-url");
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader with proper event handling
class MockFileReader {
    result: ArrayBuffer | null = null;
    onload: ((event: any) => void) | null = null;

    readAsArrayBuffer(file: File) {
        // Simulate file reading - use the file size to create appropriate ArrayBuffer
        const buffer = new ArrayBuffer(file.size || 1024);
        this.result = buffer;

        // Call onload synchronously for tests
        if (this.onload) {
            this.onload({ target: { result: buffer } });
        }
    }
}

global.FileReader = MockFileReader as any;

describe("MediaEditor.vue", () => {
    let parent: ContentParentDto;

    beforeEach(() => {
        parent = { ...mockData.mockCategoryDto };
    });

    it("does not show replacement notice when no media exists for current language", async () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                selectedLanguageId: "lang-123",
                disabled: false,
            },
        });

        expect(wrapper.text()).not.toContain(
            "Uploading a new audio file will replace the existing one",
        );
    });

    it("does not show replacement notice when media exists for different language", async () => {
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

        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                selectedLanguageId: "lang-123",
                disabled: false,
            },
        });

        expect(wrapper.text()).not.toContain(
            "Uploading a new audio file will replace the existing one",
        );
    });

    it("shows language-specific empty state message when language is selected", async () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                selectedLanguageId: "lang-123",
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("No media uploaded for this language yet.");
    });

    it("shows generic empty state message when no language is selected", async () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                selectedLanguageId: undefined,
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("No medias uploaded yet.");
    });

    it("filters file collections by selected language", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio-en.mp3",
                    languageId: "lang-123",
                    filename: "test-audio-en",
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
                {
                    fileUrl: "https://example.com/audio-fr.mp3",
                    languageId: "lang-456",
                    filename: "test-audio-fr",
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
            ],
            uploadData: [],
        };

        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                selectedLanguageId: "lang-123",
                disabled: false,
            },
        });

        // Should show the thumbnail area since there's media for the current language
        const thumbnailArea = wrapper.find('[data-test="thumbnail-area"]');
        expect(thumbnailArea.exists()).toBe(true);
    });

    it("does not show thumbnail area when no media exists for selected language", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio-fr.mp3",
                    languageId: "lang-456", // Different language
                    filename: "test-audio-fr",
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
            ],
            uploadData: [],
        };

        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                selectedLanguageId: "lang-123",
                disabled: false,
            },
        });

        // Should not show the thumbnail area since there's no media for the current language
        const thumbnailArea = wrapper.find('[data-test="thumbnail-area"]');
        expect(thumbnailArea.exists()).toBe(false);
    });

    it("respects file input constraints", async () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                selectedLanguageId: "lang-123",
                disabled: false,
            },
        });

        const fileInput = wrapper.find('[data-test="audio-upload"]');
        expect(fileInput.exists()).toBe(true);

        // Should not have multiple attribute
        expect(fileInput.attributes("multiple")).toBeUndefined();

        // Should have correct accept types
        expect(fileInput.attributes("accept")).toContain("audio/mp3");
        expect(fileInput.attributes("accept")).toContain("audio/aac");
        expect(fileInput.attributes("accept")).toContain("audio/opus");
        expect(fileInput.attributes("accept")).toContain("audio/wav");
    });
});
