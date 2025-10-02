import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import MediaEditor from "./MediaEditor.vue";
import { MediaType, type ContentParentDto, db } from "luminary-shared";

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

    it("shows generic empty state message when no media exists", async () => {
        const wrapper = mount(MediaEditor, {
            props: {
                parent: parent,
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("No audio files uploaded yet.");
    });

    it("displays thumbnail area when audio files exist", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio-en.mp3",
                    languageId: mockData.mockLanguageDtoEng._id,
                    filename: "test-audio-en",
                    bitrate: 128000,
                    mediaType: MediaType.Audio,
                },
                {
                    fileUrl: "https://example.com/audio-fr.mp3",
                    languageId: mockData.mockLanguageDtoFra._id,
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
                disabled: false,
            },
        });

        // Should show the thumbnail area since there's media
        const thumbnailArea = wrapper.find('[data-test="thumbnail-area"]');
        expect(thumbnailArea.exists()).toBe(true);

        // Should not show empty state
        expect(wrapper.text()).not.toContain("No audio files uploaded yet");
    });

    it("shows thumbnail area when media exists", async () => {
        parent.media = {
            fileCollections: [
                {
                    fileUrl: "https://example.com/audio-fr.mp3",
                    languageId: mockData.mockLanguageDtoFra._id,
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
                disabled: false,
            },
        });

        // Should show the thumbnail area
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

        // Should not have multiple attribute (we handle one file at a time with language selection)
        expect(fileInput.attributes("multiple")).toBeUndefined();

        // Should have correct accept types
        expect(fileInput.attributes("accept")).toContain("audio/mp3");
        expect(fileInput.attributes("accept")).toContain("audio/aac");
        expect(fileInput.attributes("accept")).toContain("audio/opus");
        expect(fileInput.attributes("accept")).toContain("audio/wav");
    });
});
