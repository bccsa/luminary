import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";
import waitForExpect from "wait-for-expect";
import VideoPlayer from "./VideoPlayer.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";

/**
 * What is left to test here is Luminary's half of playback: which URL is played,
 * where the key comes from, and what a resume point and a finished video mean.
 *
 * The player itself — control bar, auto-hide, keep-alive, rotation, audio-track
 * selection, audio-only mode, the YouTube branch — belongs to
 * `player-web-legacy` and is tested there. Reaching through this component to
 * assert on it would be testing someone else's library through a keyhole.
 */
const seekMock = vi.hoisted(() => vi.fn());
const playMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const pauseMock = vi.hoisted(() => vi.fn());
const enterFullscreenMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const exitFullscreenMock = vi.hoisted(() => vi.fn());
const getMediaKeyMock = vi.hoisted(() => vi.fn());

// Built inside the factory: vi.mock is hoisted above the imports, so a stub
// defined at module scope is not there yet when the factory runs.
vi.mock("@luminary-media-converter/player-web-legacy", async () => {
    const { defineComponent, h } = await import("vue");
    return {
        LuminaryPlayer: defineComponent({
            name: "LuminaryPlayer",
            props: {
                source: { type: Object, required: true },
                preferredLanguage: { type: String, default: undefined },
            },
            emits: ["loadedmetadata", "timeupdate", "ended"],
            setup(_props, { expose }) {
                expose({
                    seek: seekMock,
                    play: playMock,
                    pause: pauseMock,
                    enterFullscreen: enterFullscreenMock,
                    exitFullscreen: exitFullscreenMock,
                });
                return () => h("div", { class: "luminary-player-stub" });
            },
        }),
    };
});

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({ bucketBaseUrl: computed(() => "https://bucket.example.com") }),
}));

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    getRest: () => ({ getMediaKey: getMediaKeyMock }),
}));

const setMediaProgressMock = vi.hoisted(() => vi.fn());
const getMediaProgressMock = vi.hoisted(() => vi.fn(() => 0));
const removeMediaProgressMock = vi.hoisted(() => vi.fn());
vi.mock("@/contentProgress", () => ({
    setMediaProgress: setMediaProgressMock,
    getMediaProgress: getMediaProgressMock,
    removeMediaProgress: removeMediaProgressMock,
}));

const recordAffinityMock = vi.hoisted(() => vi.fn());
vi.mock("@/recommendation/affinityStore", () => ({ recordAffinity: recordAffinityMock }));
vi.mock("@/recommendation/defaultAffinityStore", () => ({
    affinityConfig: computed(() => ({ eventWeight: { completion: 5 } })),
}));
const markSeenMock = vi.hoisted(() => vi.fn());
vi.mock("@/recommendation/seenStore", () => ({ markSeen: markSeenMock }));

const RELATIVE = "/media/abc/master.m3u8";
const ABSOLUTE = "https://bucket.example.com/media/abc/master.m3u8";

function content(overrides: Record<string, unknown> = {}) {
    return {
        ...mockEnglishContentDto,
        parentMediaBucketId: "bucket-1",
        parentMedia: { hlsUrl: RELATIVE },
        video: undefined,
        ...overrides,
    } as any;
}

async function mountPlayer(overrides: Record<string, unknown> = {}) {
    const wrapper = mount(VideoPlayer, {
        props: { content: content(overrides), language: "en" },
        global: { stubs: { LImage: true } },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return wrapper;
}

const stub = (wrapper: any) => wrapper.findComponent({ name: "LuminaryPlayer" });

beforeEach(() => {
    vi.clearAllMocks();
    getMediaProgressMock.mockReturnValue(0);
    getMediaKeyMock.mockResolvedValue(undefined);
});

describe("VideoPlayer", () => {
    it("resolves a bucket-relative URL to a fetchable one", async () => {
        const wrapper = await mountPlayer();

        expect(stub(wrapper).props("source").masterUrl).toBe(ABSOLUTE);
    });

    it("renders no player when the document carries no video", async () => {
        const wrapper = await mountPlayer({ parentMedia: undefined });

        expect(stub(wrapper).exists()).toBe(false);
    });

    it("passes the viewer's language through for audio-track selection", async () => {
        const wrapper = await mountPlayer();

        expect(stub(wrapper).props("preferredLanguage")).toBe("en");
    });

    describe("the decryption key", () => {
        it("is fetched and handed to the player when the media is encrypted", async () => {
            getMediaKeyMock.mockResolvedValue({ keyHex: "0".repeat(32) });

            const wrapper = await mountPlayer({
                parentMedia: { hlsUrl: RELATIVE, hlsKey_id: "crypto-1" },
            });

            await waitForExpect(() =>
                expect(stub(wrapper).props("source").keyHex).toBe("0".repeat(32)),
            );
            expect(getMediaKeyMock).toHaveBeenCalledWith(mockEnglishContentDto._id);
        });

        it("is not asked for when the media is not encrypted", async () => {
            // Unencrypted is the common case; a request per video would be waste.
            await mountPlayer();

            expect(getMediaKeyMock).not.toHaveBeenCalled();
        });

        it("still plays when the key cannot be had", async () => {
            // "Not encrypted" and "not yours to have" are the same answer here:
            // play what the playlists give, and let playback fail if it must.
            getMediaKeyMock.mockResolvedValue(undefined);

            const wrapper = await mountPlayer({
                parentMedia: { hlsUrl: RELATIVE, hlsKey_id: "crypto-1" },
            });

            expect(stub(wrapper).props("source").masterUrl).toBe(ABSOLUTE);
            expect(stub(wrapper).props("source").keyHex).toBeUndefined();
        });
    });

    describe("resume position", () => {
        it("saves the position once past the resume threshold", async () => {
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("timeupdate", 90, 600);

            expect(setMediaProgressMock).toHaveBeenCalledWith(
                ABSOLUTE,
                mockEnglishContentDto._id,
                90,
                600,
            );
        });

        it("does not save a position too early to be worth resuming", async () => {
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("timeupdate", 42, 600);

            expect(setMediaProgressMock).not.toHaveBeenCalled();
        });

        it("does not save a position in a live stream", async () => {
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("timeupdate", 90, Infinity);

            expect(setMediaProgressMock).not.toHaveBeenCalled();
        });

        it("restores a saved position slightly behind where the viewer left", async () => {
            getMediaProgressMock.mockReturnValue(300);
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("loadedmetadata");

            expect(seekMock).toHaveBeenCalledWith(270);
        });

        it("does not seek for a position not worth resuming", async () => {
            getMediaProgressMock.mockReturnValue(30);
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("loadedmetadata");

            expect(seekMock).not.toHaveBeenCalled();
        });
    });

    describe("finishing a video", () => {
        it("clears the resume point and records the engagement", async () => {
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("ended");

            expect(removeMediaProgressMock).toHaveBeenCalledWith(ABSOLUTE, mockEnglishContentDto._id);
            expect(recordAffinityMock).toHaveBeenCalledWith(mockEnglishContentDto.parentTags, 5);
            expect(markSeenMock).toHaveBeenCalledWith(mockEnglishContentDto._id);
            expect(exitFullscreenMock).toHaveBeenCalled();
        });

        it("detects the end from the position when `ended` never arrives", async () => {
            // The normal case on YouTube, whose tech is known to drop the event.
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("timeupdate", 599.5, 600);

            expect(markSeenMock).toHaveBeenCalledTimes(1);
        });

        it("counts a completion once, however it was detected", async () => {
            // Otherwise the near-end fallback fires on every tick of the last
            // second, and affinity is counted several times for one viewing.
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("timeupdate", 599.2, 600);
            stub(wrapper).vm.$emit("timeupdate", 599.6, 600);
            stub(wrapper).vm.$emit("ended");

            expect(recordAffinityMock).toHaveBeenCalledTimes(1);
        });

        it("arms again for the next playthrough", async () => {
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("ended");
            stub(wrapper).vm.$emit("loadedmetadata");
            stub(wrapper).vm.$emit("ended");

            expect(recordAffinityMock).toHaveBeenCalledTimes(2);
        });
    });
});
