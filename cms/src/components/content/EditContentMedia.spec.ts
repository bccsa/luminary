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
    resume: vi.fn().mockResolvedValue(false),
    stop: vi.fn(),
};

vi.mock("@/composables/useMediaEncoder", () => ({ useMediaEncoder: () => encoder }));

vi.mock("@/composables/storageSelection", () => ({
    storageSelection: () => ({
        autoSelectMediaBucket: ref("bucket-1"),
        mediaBuckets: ref([{ _id: "bucket-1", name: "media" }]),
        hasMediaBuckets: ref(true),
        getBucketById: () => undefined,
    }),
}));

import EditContentMedia from "./EditContentMedia.vue";

const parent = () => ({ ...mockData.mockPostDto }) as PostDto;

const mountSection = (props = {}) =>
    mount(EditContentMedia, {
        props: { disabled: false, title: "Episode 12", parent: parent(), ...props },
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
        expect(wrapper.find('[data-test="encoder-status"]').exists()).toBe(false);
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
        expect(mountSection().find('[data-test="video-stub"]').exists()).toBe(false);
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
        onMediaReady({ hlsUrl: "https://cdn/master.m3u8", hlsKey: "abc" });
        await settle();

        expect(wrapper.props("parent")!.media?.hlsUrl).toBe("https://cdn/master.m3u8");
        expect(wrapper.props("parent")!.media?.hlsKey).toBe("abc");
    });

    it("writes the URL without disturbing the rest of the document's media", async () => {
        const wrapper = mountSection();
        await settle();
        await wrapper.find('[data-test="encode-media-button"]').trigger("click");

        const bucketBefore = wrapper.props("parent")!.mediaBucketId;
        encoder.start.mock.calls[0][0].onMediaReady({ hlsUrl: "https://cdn/master.m3u8" });
        await settle();

        expect(wrapper.props("parent")!.media?.hlsUrl).toBe("https://cdn/master.m3u8");
        expect(wrapper.props("parent")!.mediaBucketId).toBe(bucketBefore);
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

    it("writes back a URL recovered from a resumed session", async () => {
        encoder.resume.mockImplementation(async ({ onMediaReady }: any) => {
            onMediaReady({ hlsUrl: "https://cdn/resumed.m3u8" });
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
