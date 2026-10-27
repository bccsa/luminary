import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { PostDto } from "luminary-shared";
import * as mockData from "@/tests/mockdata";

const encoder = {
    availability: ref("available"),
    encoderVersion: ref<string | undefined>("0.0.1"),
    busy: ref(false),
    status: ref<string | undefined>(undefined),
    progress: ref<number | undefined>(undefined),
    error: ref<string | undefined>(undefined),
    sessionId: ref<string | undefined>(undefined),
    outdated: ref(false),
    refreshAvailability: vi.fn().mockResolvedValue(true),
    watchForEncoder: vi.fn(),
    start: vi.fn(),
    edit: vi.fn(),
    resume: vi.fn().mockResolvedValue(false),
    stop: vi.fn(),
};

vi.mock("@/composables/useMediaEncoder", () => ({ useMediaEncoder: () => encoder }));

vi.mock("@/composables/storageSelection", () => ({
    storageSelection: () => ({
        autoSelectMediaBucket: ref("bucket-1"),
        effectiveMediaBucketId: (persisted?: string) => persisted ?? "bucket-1",
        mediaBuckets: ref([{ _id: "bucket-1", name: "media" }]),
        hasMediaBuckets: ref(true),
        getBucketById: (id: string | null) =>
            id == "bucket-1"
                ? { _id: "bucket-1", name: "media", publicUrl: "https://cdn.example.com/media" }
                : undefined,
    }),
}));

import EditContentMedia from "./EditContentMedia.vue";
import LDialog from "../common/LDialog.vue";

const parent = () => ({ ...mockData.mockPostDto }) as PostDto;

const mountSection = (props = {}) =>
    mount(EditContentMedia, {
        props: {
            disabled: false,
            title: "Episode 12",
            parent: parent(),
            showVideo: true,
            ...props,
        },
        global: {
            stubs: {
                EditContentVideo: { template: "<div data-test='video-stub' />" },
                MediaBucketSelect: { template: "<div data-test='bucket-stub' />" },
            },
        },
    });

const settle = () => new Promise((resolve) => setTimeout(resolve));

beforeEach(() => {
    vi.clearAllMocks();
    encoder.availability.value = "available";
    encoder.busy.value = false;
    encoder.status.value = undefined;
    encoder.error.value = undefined;
});

/**
 * The section owns the encode because it owns the document: the button and the
 * progress are two ends of one thing that used to sit in two different cards.
 */
describe("EditContentMedia", () => {
    it("holds the whole media job in one section", async () => {
        const wrapper = mountSection();
        await settle();

        expect(wrapper.find('[data-test="encode-media-button"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="bucket-stub"]').exists()).toBe(true);
    });

    it("names where to get the app in the help text", async () => {
        // Findable when no notice is showing — an editor who has not tried to
        // encode yet has nothing else pointing at the download.
        const wrapper = mountSection();
        await settle();

        await wrapper.find('[aria-label="Media help"]').trigger("click");

        const link = wrapper.find('[data-test="media-help-download"]');
        expect(link.exists()).toBe(true);
        expect(link.attributes("href")).toContain("releases");
    });

    it("shows the video fields only once a translation is selected", async () => {
        expect(mountSection({ showVideo: false }).find('[data-test="video-stub"]').exists()).toBe(
            false,
        );
        expect(mountSection({ showVideo: true }).find('[data-test="video-stub"]').exists()).toBe(
            true,
        );
    });

    it("starts an encode for this document and title", async () => {
        const wrapper = mountSection();
        await settle();

        await wrapper.find('[data-test="encode-media-button"]').trigger("click");

        expect(encoder.start).toHaveBeenCalledWith(
            expect.objectContaining({
                documentId: mockData.mockPostDto._id,
                title: "Episode 12",
                mediaBucketId: "bucket-1",
            }),
        );
    });

    describe("on a document that has never been saved", () => {
        // Leaving an unsaved post discards it, but the encode would run on and
        // publish media no document points to.
        const clickEncode = async (saveBeforeEncode: () => Promise<boolean>) => {
            const wrapper = mountSection({ saveBeforeEncode });
            await settle();
            await wrapper.find('[data-test="encode-media-button"]').trigger("click");
            return wrapper
                .findAllComponents(LDialog)
                .find((dialog) => dialog.props("title") === "Save before encoding")!;
        };

        it("asks the editor to save before encoding", async () => {
            const dialog = await clickEncode(vi.fn());

            expect(dialog.props("open")).toBe(true);
            expect(encoder.start).not.toHaveBeenCalled();
        });

        it("saves and then encodes on Save now", async () => {
            const save = vi.fn().mockResolvedValue(true);
            const dialog = await clickEncode(save);

            await dialog.props("primaryAction")();

            expect(save).toHaveBeenCalled();
            expect(encoder.start).toHaveBeenCalled();
        });

        it("does not encode when the save did not go through", async () => {
            const dialog = await clickEncode(vi.fn().mockResolvedValue(false));

            await dialog.props("primaryAction")();

            expect(encoder.start).not.toHaveBeenCalled();
        });
    });

    it("records the auto-selected bucket on the document when an encode starts", async () => {
        const doc = parent();
        doc.mediaBucketId = undefined;
        const wrapper = mountSection({ parent: doc });
        await settle();

        await wrapper.find('[data-test="encode-media-button"]').trigger("click");

        expect(wrapper.props("parent")!.mediaBucketId).toBe("bucket-1");
    });

    it("writes the playback URL and key onto the document as soon as they exist", async () => {
        const wrapper = mountSection();
        await settle();
        await wrapper.find('[data-test="encode-media-button"]').trigger("click");

        const { onMediaReady } = encoder.start.mock.calls[0][0];
        onMediaReady(
            { hlsUrl: "https://cdn/master.m3u8", hlsKey: "abc" },
            mockData.mockPostDto._id,
        );
        await settle();

        expect(wrapper.props("parent")!.media?.hlsUrl).toBe("https://cdn/master.m3u8");
        expect(wrapper.props("parent")!.media?.hlsKey).toBe("abc");
    });

    it("hands the write to the editor to save when it can", async () => {
        const saveEncodedMedia = vi.fn(async (write: () => void) => write());
        const wrapper = mountSection({ saveEncodedMedia });
        await settle();
        await wrapper.find('[data-test="encode-media-button"]').trigger("click");

        const { onMediaReady } = encoder.start.mock.calls[0][0];
        onMediaReady({ hlsUrl: "https://cdn/master.m3u8" }, mockData.mockPostDto._id);
        await settle();

        expect(saveEncodedMedia).toHaveBeenCalledTimes(1);
        expect(wrapper.props("parent")!.media?.hlsUrl).toBe("https://cdn/master.m3u8");
    });

    it("refuses a result for a document the editor has since left", async () => {
        // The encoder's trust prompt can hold start() open for as long as the user
        // likes; by the time it answers, this section may be showing another post.
        const wrapper = mountSection();
        await settle();
        await wrapper.find('[data-test="encode-media-button"]').trigger("click");
        const { onMediaReady } = encoder.start.mock.calls[0][0];

        await wrapper.setProps({
            parent: { ...parent(), _id: "post-2", media: undefined } as PostDto,
        });
        onMediaReady(
            { hlsUrl: "https://cdn/master.m3u8", hlsKey: "abc" },
            mockData.mockPostDto._id,
        );
        await settle();

        expect(wrapper.props("parent")!.media).toBeUndefined();
    });
});

describe("EditContentMedia — deleting the video", () => {
    const withVideo = () =>
        ({
            ...parent(),
            media: { hlsUrl: "/abc/master.m3u8" },
            mediaBucketId: "bucket-1",
        }) as PostDto;

    it("offers Delete video only when the document has one", () => {
        const noVideo = { ...parent(), media: undefined } as PostDto;
        expect(
            mountSection({ parent: noVideo }).find('[data-test="delete-media-button"]').exists(),
        ).toBe(false);
        expect(
            mountSection({ parent: withVideo() })
                .find('[data-test="delete-media-button"]')
                .exists(),
        ).toBe(true);
    });

    const deleteDialog = (wrapper: ReturnType<typeof mountSection>) =>
        wrapper
            .findAllComponents(LDialog)
            .find((dialog) => dialog.props("title") === "Delete the video?")!;

    it("asks first, showing the video that will go, and changes nothing yet", async () => {
        const saveDeletedMedia = vi.fn();
        const wrapper = mountSection({ parent: withVideo(), saveDeletedMedia });
        await wrapper.find('[data-test="delete-media-button"]').trigger("click");

        expect(deleteDialog(wrapper).props("open")).toBe(true);
        expect(saveDeletedMedia).not.toHaveBeenCalled();
        expect((wrapper.props("parent") as PostDto).media?.hlsUrl).toBe("/abc/master.m3u8");
    });

    it("hands the removal to the editor to save once confirmed", async () => {
        const saveDeletedMedia = vi.fn(async (write: () => void) => write());
        const wrapper = mountSection({ parent: withVideo(), saveDeletedMedia });
        await wrapper.find('[data-test="delete-media-button"]').trigger("click");
        await deleteDialog(wrapper).props("primaryAction")();

        expect(saveDeletedMedia).toHaveBeenCalledOnce();
        expect((wrapper.props("parent") as PostDto).media).toBeUndefined();
    });

    it("says files go only for a video in our storage", async () => {
        const stored = mountSection({ parent: withVideo() });
        await stored.find('[data-test="delete-media-button"]').trigger("click");
        expect(deleteDialog(stored).props("description")).toContain("deletes its files");

        const youtube = mountSection({
            parent: {
                ...withVideo(),
                media: { hlsUrl: "https://www.youtube.com/watch?v=abc" },
            } as PostDto,
        });
        await youtube.find('[data-test="delete-media-button"]').trigger("click");
        expect(deleteDialog(youtube).props("description")).toContain("no files are deleted");
    });

    it("leaves the video when cancelled", async () => {
        const saveDeletedMedia = vi.fn();
        const wrapper = mountSection({ parent: withVideo(), saveDeletedMedia });
        await wrapper.find('[data-test="delete-media-button"]').trigger("click");
        await deleteDialog(wrapper).props("secondaryAction")();

        expect(saveDeletedMedia).not.toHaveBeenCalled();
        expect((wrapper.props("parent") as PostDto).media?.hlsUrl).toBe("/abc/master.m3u8");
    });

    it("cannot be pressed without permission to edit", () => {
        const wrapper = mountSection({ parent: withVideo(), disabled: true });
        expect(
            wrapper.find('[data-test="delete-media-button"]').attributes("disabled"),
        ).toBeDefined();
    });
});

describe("EditContentMedia resume", () => {
    it("asks whether this document already has an encode running", async () => {
        mountSection();
        await settle();

        expect(encoder.resume).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: mockData.mockPostDto._id }),
        );
    });

    it("follows the editor to another document rather than the one it was built for", async () => {
        const wrapper = mountSection();
        await settle();
        encoder.resume.mockClear();

        await wrapper.setProps({ parent: { ...parent(), _id: "post-2" } as PostDto });
        await settle();

        expect(encoder.resume).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: "post-2" }),
        );
    });

    it("leaves the document alone when a resumed session offers what it already has", async () => {
        // The API stores the URL relative to the bucket; the encoder offers it
        // absolute. Writing it back marks an untouched document edited, and in a save
        // that also changes the bucket the API reads the pair as a hand edit.
        encoder.resume.mockImplementation(async ({ documentId, onMediaReady }: any) => {
            onMediaReady(
                { hlsUrl: "https://cdn.example.com/media/abc/master.m3u8", hlsKey: "abc" },
                documentId,
            );
            return true;
        });
        const stored = {
            ...parent(),
            mediaBucketId: "bucket-1",
            media: { hlsUrl: "/abc/master.m3u8" },
        } as PostDto;

        const wrapper = mountSection({ parent: stored });
        await settle();

        expect(wrapper.props("parent")!.media).toEqual({ hlsUrl: "/abc/master.m3u8" });
    });

    it("writes back a URL recovered from a resumed session", async () => {
        encoder.resume.mockImplementation(async ({ documentId, onMediaReady }: any) => {
            onMediaReady({ hlsUrl: "https://cdn/resumed.m3u8" }, documentId);
            return true;
        });

        const wrapper = mountSection();
        await settle();

        expect(wrapper.props("parent")!.media?.hlsUrl).toBe("https://cdn/resumed.m3u8");
    });
});

describe("EditContentMedia status", () => {
    it("puts progress in the body, with the width of the section", async () => {
        encoder.status.value = "encoding";
        encoder.progress.value = 42;

        const wrapper = mountSection();
        await settle();

        expect(wrapper.find('[data-test="encoder-progress-bar"]').exists()).toBe(true);
    });

    it("explains an unreachable encoder below the control rather than replacing it", async () => {
        encoder.availability.value = "unavailable";

        const wrapper = mountSection();
        await settle();

        expect(wrapper.find('[data-test="encoder-unavailable"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="encode-media-button"]').exists()).toBe(true);
    });
});

describe("EditContentMedia editing the existing video", () => {
    // A resume elsewhere in this file hands the section a URL; here no encode is running.
    beforeEach(() => encoder.resume.mockReset().mockResolvedValue(false));

    const withVideo = () =>
        ({ ...parent(), media: { hlsUrl: "/posts/p1/s1/master.m3u8" } }) as PostDto;

    it("offers no edit for a document without a video", async () => {
        const wrapper = mountSection({ parent: { ...parent(), media: undefined } });
        await settle();
        expect(wrapper.find("[data-test='edit-media-button']").exists()).toBe(false);
    });

    it("opens the video it has, at its absolute address", async () => {
        const wrapper = mountSection({ parent: withVideo() });
        await settle();
        await wrapper.find("[data-test='edit-media-button']").trigger("click");

        expect(encoder.edit).toHaveBeenCalledWith({
            documentId: withVideo()._id,
            title: "Episode 12",
            mediaBucketId: "bucket-1",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s1/master.m3u8",
        });
    });

    it("cannot be used without permission to edit the document, or without the encoder", async () => {
        const denied = mountSection({ parent: withVideo(), disabled: true });
        await settle();
        expect(denied.find("[data-test='edit-media-button']").attributes("disabled")).toBeDefined();

        encoder.availability.value = "unavailable";
        const offline = mountSection({ parent: withVideo() });
        await settle();
        expect(
            offline.find("[data-test='edit-media-button']").attributes("disabled"),
        ).toBeDefined();
    });
});
