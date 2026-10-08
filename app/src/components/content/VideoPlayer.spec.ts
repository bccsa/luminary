import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick } from "vue";
import waitForExpect from "wait-for-expect";
import VideoPlayer from "./VideoPlayer.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import { shareImageUrl } from "@/composables/useSocialShare";
import { userDataSaverEnabled } from "@/globalConfig";
import { fallbackArtworkDataUrl } from "@/util/fallbackArtwork";
import {
    connectionSpeed,
    hasMeasuredConnectionSpeed,
} from "@/composables/useNetworkSpeedEstimator";

/**
 * What is left to test here is Luminary's half of playback: which URL is played,
 * where the key comes from, and what a resume point and a finished video mean.
 *
 * The player itself — control bar, auto-hide, keep-alive, rotation, audio-track
 * selection, audio-only mode, the YouTube branch — belongs to
 * `player-web` and is tested there. Reaching through this component to
 * assert on it would be testing someone else's library through a keyhole.
 */
const seekMock = vi.hoisted(() => vi.fn());
const playMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const pauseMock = vi.hoisted(() => vi.fn());
const enterFullscreenMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const exitFullscreenMock = vi.hoisted(() => vi.fn());
const fetchHlsKeyMock = vi.hoisted(() => vi.fn());

// Built inside the factory: vi.mock is hoisted above the imports, so a stub
// defined at module scope is not there yet when the factory runs.
vi.mock("@/util/fallbackArtwork", () => ({
    fallbackArtworkDataUrl: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@luminary-media-converter/player-web", async () => {
    const { defineComponent, h } = await import("vue");
    return {
        AUDIO_ONLY_ANGLE_ID: "__audio__",
        isYouTubeUrl: (url: string | undefined) => !!url && url.includes("youtube.com"),
        LuminaryPlayer: defineComponent({
            name: "LuminaryPlayer",
            props: {
                source: { type: Object, required: true },
                preferredLanguage: { type: String, default: undefined },
                controls: { type: Object, default: undefined },
                messages: { type: Object, default: undefined },
                controllerOptions: { type: Object, default: undefined },
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
                // A real `<video>`, so the Matomo scan has something to title.
                return () => h("div", { class: "luminary-player-stub" }, [h("video")]);
            },
        }),
    };
});

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({ bucketBaseUrl: computed(() => "https://bucket.example.com") }),
}));

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    fetchHlsKey: fetchHlsKeyMock,
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

async function mountPlayer(
    overrides: Record<string, unknown> = {},
    props: Record<string, unknown> = {},
) {
    const wrapper = mount(VideoPlayer, {
        props: { content: content(overrides), language: "en", ...props },
        global: { stubs: { LImage: true } },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return wrapper;
}

const stub = (wrapper: any) => wrapper.findComponent({ name: "LuminaryPlayer" });

beforeEach(() => {
    vi.clearAllMocks();
    getMediaProgressMock.mockReturnValue(0);
    fetchHlsKeyMock.mockResolvedValue(undefined);
});

describe("VideoPlayer", () => {
    describe("media analytics", () => {
        it("hands the video to Matomo once the player has rendered", async () => {
            const paq: unknown[][] = [];
            (window as any)._paq = paq;

            await mountPlayer();

            expect(paq).toContainEqual(["MediaAnalytics::enableMediaAnalytics"]);
            expect(paq.some((c) => c[0] === "MediaAnalytics::scanForMedia")).toBe(true);
        });

        it("titles the video element itself, which is what the scan reads", async () => {
            (window as any)._paq = [];

            const wrapper = await mountPlayer();

            expect(wrapper.find("video").attributes("data-matomo-title")).toBe(
                mockEnglishContentDto.title,
            );
        });

        it("follows a title edited while the same video is playing", async () => {
            // main bound the attribute on its own <video>, so a synced title change
            // reapplied itself. The element is the player's now, so this has to.
            (window as any)._paq = [];
            const wrapper = await mountPlayer();

            await wrapper.setProps({ content: content({ title: "Renamed in the CMS" }) });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(wrapper.find("video").attributes("data-matomo-title")).toBe(
                "Renamed in the CMS",
            );
        });

        it("says nothing when there is no video to report on", async () => {
            const paq: unknown[][] = [];
            (window as any)._paq = paq;

            await mountPlayer({ parentMedia: undefined });

            expect(paq).toHaveLength(0);
        });
    });

    it("resolves a bucket-relative URL to a fetchable one", async () => {
        const wrapper = await mountPlayer();

        expect(stub(wrapper).props("source").masterUrl).toBe(ABSOLUTE);
    });

    it("offers the chapters file beside the master, in English, the one language there is", async () => {
        const wrapper = await mountPlayer();

        expect(stub(wrapper).props("source").sidecars.chapters).toEqual([
            { lang: "en", url: "https://bucket.example.com/media/abc/chapters/en.vtt" },
        ]);
    });

    it("offers English to a viewer in another language too: their chapters are the English ones", async () => {
        const wrapper = await mountPlayer({}, { language: "fr" });

        expect(stub(wrapper).props("source").sidecars.chapters).toEqual([
            { lang: "en", url: "https://bucket.example.com/media/abc/chapters/en.vtt" },
        ]);
    });

    it("renders no player when the document carries no video", async () => {
        const wrapper = await mountPlayer({ parentMedia: undefined });

        expect(stub(wrapper).exists()).toBe(false);
    });

    it("passes the viewer's language through for audio-track selection", async () => {
        const wrapper = await mountPlayer();

        expect(stub(wrapper).props("preferredLanguage")).toBe("en");
    });

    it("hands the player its own strings through the app's translations, not the player's English", async () => {
        const wrapper = await mountPlayer();

        const messages = stub(wrapper).props("messages");
        expect(messages.comingSoon).toContain("video_player.coming_soon");
        expect(messages.retry).toContain("video_player.retry");
        expect(messages.skipBack).toContain("media_player.skip_back");
    });

    describe("in the media player", () => {
        it("bares the frame: the media player draws the transport and the audio / video switch", async () => {
            const wrapper = await mountPlayer();

            expect(stub(wrapper).props("controls")).toEqual({
                subtitlesMenu: false,
                audioVideoToggle: false,
                windowedControls: false,
            });
        });

        describe("what the connection says", () => {
            afterEach(() => {
                userDataSaverEnabled.value = false;
                hasMeasuredConnectionSpeed.value = false;
            });

            it("caps the picture at 360p under Data Saver, and not otherwise", async () => {
                expect(stub(await mountPlayer()).props("source").maxHeight).toBeUndefined();

                userDataSaverEnabled.value = true;
                expect(stub(await mountPlayer()).props("source").maxHeight).toBe(360);
            });

            it("turns background chunk warming off under Data Saver, and leaves it on otherwise", async () => {
                expect(stub(await mountPlayer()).props("controllerOptions")).toEqual({
                    prefetch: { enabled: true },
                });

                userDataSaverEnabled.value = true;
                expect(stub(await mountPlayer()).props("controllerOptions")).toEqual({
                    prefetch: { enabled: false },
                });
            });

            it("starts the player's ABR from the measured speed in bits per second", async () => {
                connectionSpeed.value = 2.5;
                hasMeasuredConnectionSpeed.value = true;

                expect(stub(await mountPlayer()).props("source").bandwidthEstimate).toBe(2_500_000);
            });

            it("offers no estimate until a real reading exists, rather than the optimistic default", async () => {
                connectionSpeed.value = 10;
                hasMeasuredConnectionSpeed.value = false;

                expect(stub(await mountPlayer()).props("source").bandwidthEstimate).toBeUndefined();
            });

            it("does not reload the stream when a later probe changes the speed", async () => {
                connectionSpeed.value = 2.5;
                hasMeasuredConnectionSpeed.value = true;
                const wrapper = await mountPlayer();

                connectionSpeed.value = 8;
                await nextTick();

                expect(stub(wrapper).props("source").bandwidthEstimate).toBe(2_500_000);
            });
        });

        it("starts on the sound alone when asked, so no video is fetched", async () => {
            const wrapper = await mountPlayer({}, { startAudio: true });

            expect(stub(wrapper).props("source").startAngleId).toBe("__audio__");
        });

        it("starts on the video otherwise", async () => {
            const wrapper = await mountPlayer();

            expect(stub(wrapper).props("source").startAngleId).toBeUndefined();
        });

        it("reads the start for the content it plays, so a later change does not reload it", async () => {
            const wrapper = await mountPlayer({}, { startAudio: true });
            await wrapper.setProps({ startAudio: false });

            expect(stub(wrapper).props("source").startAngleId).toBe("__audio__");
        });

        it("plays once loaded, and goes full-screen for a video when the player shows it only there", async () => {
            const wrapper = await mountPlayer({}, { autoplay: true, fullscreenOnPlay: true });
            stub(wrapper).vm.$emit("loadedmetadata");

            expect(playMock).toHaveBeenCalled();
            expect(enterFullscreenMock).toHaveBeenCalled();
        });

        it("stays out of full-screen when it starts on the sound", async () => {
            const wrapper = await mountPlayer(
                {},
                { autoplay: true, fullscreenOnPlay: true, startAudio: true },
            );
            stub(wrapper).vm.$emit("loadedmetadata");

            expect(playMock).toHaveBeenCalled();
            expect(enterFullscreenMock).not.toHaveBeenCalled();
        });
    });

    describe("the decryption key", () => {
        const KEY_HEX = "000102030405060708090a0b0c0d0e0f";

        it("is fetched and handed to the player when the media is encrypted", async () => {
            fetchHlsKeyMock.mockResolvedValue(KEY_HEX);

            const wrapper = await mountPlayer({
                parentMedia: { hlsUrl: RELATIVE, hlsKey_id: "sidecar-1" },
            });

            await waitForExpect(() => expect(stub(wrapper).props("source").keyHex).toBe(KEY_HEX));
            expect(fetchHlsKeyMock).toHaveBeenCalledWith(mockEnglishContentDto.parentId);
        });

        it("is in hand before the player is given the source, so the stream loads once", async () => {
            // Handing over the URL first and the key a tick later makes the player
            // load, fail on the key, and load again.
            let resolveKey!: (key: string) => void;
            fetchHlsKeyMock.mockImplementationOnce(
                () => new Promise<string>((resolve) => (resolveKey = resolve)),
            );

            const wrapper = await mountPlayer({
                parentMedia: { hlsUrl: RELATIVE, hlsKey_id: "sidecar-1" },
            });
            expect(stub(wrapper).exists()).toBe(false);

            resolveKey(KEY_HEX);
            await waitForExpect(() => expect(stub(wrapper).props("source").keyHex).toBe(KEY_HEX));
        });

        it("is not asked for when the media is not encrypted", async () => {
            // Unencrypted is the common case; a request per video would be waste.
            await mountPlayer();

            expect(fetchHlsKeyMock).not.toHaveBeenCalled();
        });

        it("still renders a player when the key request throws", async () => {
            // `crypto.subtle` is undefined outside a secure context, so this is what
            // LAN testing on http hits. Leaving the key unresolved shows only a poster.
            fetchHlsKeyMock.mockRejectedValue(new Error("Web Crypto is unavailable"));

            const wrapper = await mountPlayer({
                parentMedia: { hlsUrl: RELATIVE, hlsKey_id: "sidecar-1" },
            });

            expect(stub(wrapper).exists()).toBe(true);
            expect(stub(wrapper).props("source").masterUrl).toBe(ABSOLUTE);
        });

        it("still plays when the key cannot be had", async () => {
            // "Not encrypted" and "not yours to have" are the same answer here:
            // play what the playlists give, and let playback fail if it must.
            fetchHlsKeyMock.mockResolvedValue(undefined);

            const wrapper = await mountPlayer({
                parentMedia: { hlsUrl: RELATIVE, hlsKey_id: "sidecar-1" },
            });

            expect(stub(wrapper).props("source").masterUrl).toBe(ABSOLUTE);
            expect(stub(wrapper).props("source").keyHex).toBeUndefined();
        });
    });

    describe("resume position", () => {
        it("saves the position once past the resume threshold", async () => {
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("timeupdate", 90, 600);

            // The stored URL, not the resolved one: ContentTile reads progress under
            // exactly this and never resolves a bucket.
            expect(setMediaProgressMock).toHaveBeenCalledWith(
                RELATIVE,
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

        it("starts and restores the position on the first load only, not on a switch of mode", async () => {
            getMediaProgressMock.mockReturnValue(300);
            const wrapper = await mountPlayer({}, { autoplay: true });
            stub(wrapper).vm.$emit("loadedmetadata");
            expect(playMock).toHaveBeenCalledTimes(1);
            expect(seekMock).toHaveBeenCalledTimes(1);

            // Audio to video, or back: the player loads again, and a paused video stays paused.
            stub(wrapper).vm.$emit("loadedmetadata");
            stub(wrapper).vm.$emit("loadedmetadata");
            expect(playMock).toHaveBeenCalledTimes(1);
            expect(seekMock).toHaveBeenCalledTimes(1);
        });

        it("does not seek for a position not worth resuming", async () => {
            getMediaProgressMock.mockReturnValue(30);
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("loadedmetadata");

            expect(seekMock).not.toHaveBeenCalled();
        });
    });

    describe("the build target's player", () => {
        /** A player that takes lock-screen metadata, as the packaged app's does. */
        const NativeStub = defineComponent({
            name: "NativeStub",
            props: {
                source: { type: Object, required: true },
                preferredLanguage: { type: String, default: undefined },
                controls: { type: Object, default: undefined },
                nowPlaying: { type: Object, default: undefined },
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
                return () => h("div", { class: "native-stub" }, [h("video")]);
            },
        });

        async function mountWithService(acceptsNowPlaying: boolean) {
            const wrapper = mount(VideoPlayer, {
                props: { content: content(), language: "en" },
                global: {
                    stubs: { LImage: true },
                    provide: {
                        [VideoPlayerKey as symbol]: { component: NativeStub, acceptsNowPlaying },
                    },
                },
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
            return wrapper;
        }

        it("renders the provided player in place of the browser's", async () => {
            const wrapper = await mountWithService(true);

            expect(wrapper.findComponent(NativeStub).exists()).toBe(true);
            expect(wrapper.findComponent({ name: "LuminaryPlayer" }).exists()).toBe(false);
            expect(wrapper.findComponent(NativeStub).props("source")).toEqual({
                masterUrl: ABSOLUTE,
                keyHex: undefined,
                sidecars: {
                    chapters: [
                        { lang: "en", url: "https://bucket.example.com/media/abc/chapters/en.vtt" },
                    ],
                },
            });
        });

        it("drives the provided player the same way: resume and finish", async () => {
            getMediaProgressMock.mockReturnValue(300);
            const wrapper = await mountWithService(true);
            const player = wrapper.findComponent(NativeStub);

            player.vm.$emit("loadedmetadata");
            player.vm.$emit("ended");

            expect(seekMock).toHaveBeenCalledWith(270);
            expect(exitFullscreenMock).toHaveBeenCalled();
        });

        it("hands a player that takes it the title and the post's image for the lock screen", async () => {
            const wrapper = await mountWithService(true);

            expect(wrapper.findComponent(NativeStub).props("nowPlaying")).toEqual({
                title: mockEnglishContentDto.title,
                artworkUrl: shareImageUrl(content(), "https://bucket.example.com"),
            });
        });

        it("adds the page's stand-in picture for a post whose own image does not load", async () => {
            vi.mocked(fallbackArtworkDataUrl).mockResolvedValueOnce("data:image/jpeg;base64,AAAA");

            const wrapper = await mountWithService(true);

            expect(wrapper.findComponent(NativeStub).props("nowPlaying")).toEqual({
                title: mockEnglishContentDto.title,
                artworkUrl: shareImageUrl(content(), "https://bucket.example.com"),
                fallbackArtworkUrl: "data:image/jpeg;base64,AAAA",
            });
        });

        it("gives the browser's player no lock-screen metadata to render as an attribute", async () => {
            const wrapper = await mountPlayer();

            expect(stub(wrapper).attributes("nowplaying")).toBeUndefined();
            expect(stub(wrapper).attributes("now-playing")).toBeUndefined();
        });
    });

    describe("finishing a video", () => {
        it("clears the resume point and records the engagement", async () => {
            const wrapper = await mountPlayer();

            stub(wrapper).vm.$emit("ended");

            expect(removeMediaProgressMock).toHaveBeenCalledWith(
                RELATIVE,
                mockEnglishContentDto._id,
            );
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
