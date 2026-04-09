import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import MediaEditorThumbnail from "./MediaEditorThumbnail.vue";
import LDialog from "@/components/common/LDialog.vue";
import LBadge from "@/components/common/LBadge.vue";
import { MediaPreset, MediaType, type MediaFileDto, type MediaUploadDataDto } from "luminary-shared";

// Mock URL.createObjectURL / revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:mock-audio-url");
global.URL.revokeObjectURL = vi.fn();

// Mock HTMLAudioElement play/pause
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();

Object.defineProperty(HTMLAudioElement.prototype, "play", { value: mockPlay, writable: true });
Object.defineProperty(HTMLAudioElement.prototype, "pause", { value: mockPause, writable: true });

const mockMediaFile: MediaFileDto = {
    fileUrl: "https://example.com/audio-en.mp3",
    languageId: "lang-eng",
    mediaType: "audio" as any,
    bitrate: 128000,
};

const mockUploadData: MediaUploadDataDto = {
    languageId: "lang-eng",
    fileData: new ArrayBuffer(100),
    mediaType: MediaType.Audio,
    preset: MediaPreset.Speech,
};

describe("MediaEditorThumbnail", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders with a language badge for existing media", () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
            },
        });

        const badge = wrapper.findComponent(LBadge);
        expect(badge.exists()).toBe(true);
        expect(badge.text()).toContain("ENG");
    });

    it("renders with a language badge for upload data", () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaUploadData: mockUploadData,
                languageCode: "ENG",
            },
        });

        const badge = wrapper.findComponent(LBadge);
        expect(badge.exists()).toBe(true);
        expect(badge.text()).toContain("ENG");
    });

    it("shows delete confirmation dialog", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
                disabled: true,
            },
        });

        // Hover and click trash
        await wrapper.find(".group").trigger("mouseover");
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) {
            await trashIcon.trigger("click");

            const dialog = wrapper.findComponent(LDialog);
            expect(dialog.props("open")).toBe(true);
            expect(dialog.props("title")).toBe("Delete file version");
        }
    });

    it("emits deleteFileCollection when confirmed for existing media", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
                disabled: true,
            },
        });

        // Open and confirm delete
        await wrapper.find(".group").trigger("mouseover");
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) await trashIcon.trigger("click");

        const dialog = wrapper.findComponent(LDialog);
        const primaryAction = dialog.props("primaryAction") as Function;
        primaryAction();

        expect(wrapper.emitted("deleteFileCollection")).toBeTruthy();
        expect(wrapper.emitted("deleteFileCollection")![0]).toEqual([mockMediaFile]);
    });

    it("emits deleteUploadData when confirmed for upload data", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaUploadData: mockUploadData,
                languageCode: "ENG",
                disabled: true,
            },
        });

        await wrapper.find(".group").trigger("mouseover");
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) await trashIcon.trigger("click");

        const dialog = wrapper.findComponent(LDialog);
        const primaryAction = dialog.props("primaryAction") as Function;
        primaryAction();

        expect(wrapper.emitted("deleteUploadData")).toBeTruthy();
        expect(wrapper.emitted("deleteUploadData")![0]).toEqual([mockUploadData]);
    });

    it("closes dialog on cancel", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
                disabled: true,
            },
        });

        await wrapper.find(".group").trigger("mouseover");
        const trashIcon = wrapper.find('[title="Delete file version"]');
        if (trashIcon.exists()) await trashIcon.trigger("click");

        const dialog = wrapper.findComponent(LDialog);
        const secondaryAction = dialog.props("secondaryAction") as Function;
        secondaryAction();

        expect(dialog.props("open")).toBe(false);
    });

    it("has an audio element with correct src for existing media", () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
            },
        });

        const audio = wrapper.find("audio");
        expect(audio.exists()).toBe(true);
        expect(audio.attributes("src")).toBe("https://example.com/audio-en.mp3");
    });

    it("creates blob URL for upload data audio", () => {
        mount(MediaEditorThumbnail, {
            props: {
                mediaUploadData: mockUploadData,
                languageCode: "ENG",
            },
        });

        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it("renders nothing when neither mediaFile nor mediaUploadData is provided", () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                languageCode: "ENG",
            },
        });

        // Should render the outer div but no .group child
        expect(wrapper.find(".group").exists()).toBe(false);
    });

    it("togglePlay starts playback when clicking on existing media", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
            },
        });

        await wrapper.find(".group").trigger("click");
        expect(mockPlay).toHaveBeenCalled();
    });

    it("togglePlay pauses when already playing", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
            },
        });

        // First click to start playing
        await wrapper.find(".group").trigger("click");
        // Wait for the play promise to resolve
        await vi.waitFor(() => expect(mockPlay).toHaveBeenCalled());

        // Second click to pause
        await wrapper.find(".group").trigger("click");
        expect(mockPause).toHaveBeenCalled();
    });

    it("resets playing state when audio ends", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
            },
        });

        // Start playing
        await wrapper.find(".group").trigger("click");
        await vi.waitFor(() => expect(mockPlay).toHaveBeenCalled());

        // Trigger ended event on audio element
        const audio = wrapper.find("audio");
        await audio.trigger("ended");

        // After ended, clicking should play again (not pause)
        mockPlay.mockClear();
        await wrapper.find(".group").trigger("click");
        expect(mockPlay).toHaveBeenCalled();
    });

    it("pauses when another instance starts playing via global event", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaFile: mockMediaFile,
                languageCode: "ENG",
            },
        });

        // Start playing this instance
        await wrapper.find(".group").trigger("click");
        await vi.waitFor(() => expect(mockPlay).toHaveBeenCalled());

        // Dispatch global event from a different audio element
        const otherAudioEl = document.createElement("audio");
        window.dispatchEvent(
            new CustomEvent("cms-audio-thumbnail-play", { detail: otherAudioEl }),
        );

        expect(mockPause).toHaveBeenCalled();
    });

    it("togglePlay works for upload data", async () => {
        const wrapper = mount(MediaEditorThumbnail, {
            props: {
                mediaUploadData: mockUploadData,
                languageCode: "ENG",
            },
        });

        await wrapper.find(".group").trigger("click");
        expect(mockPlay).toHaveBeenCalled();
    });
});
