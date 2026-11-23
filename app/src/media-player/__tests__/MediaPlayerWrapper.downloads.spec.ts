import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, reactive, ref } from "vue";
import MediaPlayerWrapper from "../MediaPlayerWrapper.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import type { DownloadPlayback, DownloadsService } from "@/build-time/contracts/downloads/contract";
import { mediaSourceFor } from "@/util/mediaSource";
import {
    getMediaDuration,
    getMediaProgress,
    isMediaCompleted,
    isMediaFinished,
    setMediaProgress,
    markMediaCompleted,
    mediaProgressKey,
    syncContentProgressFromStorage,
} from "@/contentProgress";
import { dataSaverOverride, playOnlineOverride } from "../mediaPlayer";
import { recordAffinity } from "@/recommendation/affinityStore";
import { fallbackArtworkDataUrl } from "@/util/fallbackArtwork";
import { actOnPlayerNotice, dismissPlayerNotice, playerNotice } from "../playerNotice";
import { downloadsServiceStub, entryOf, playbackOf, timelineOf } from "./downloadsStub";

/**
 * The player's half of downloads: which copy opens, the timeline at the four progress points, the completed mark,
 * the switch when more is ready, a session the engine closes, casting, and the notices. The service is a stub built
 * from the contract; the player a stand-in exposing what the native one does.
 */
const fetchHlsKeyMock = vi.hoisted(() => vi.fn());
const playMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const handleState = vi.hoisted(() => ({ current: null as any }));

vi.mock("@/util/fallbackArtwork", () => ({
    fallbackArtworkDataUrl: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@luminary-media-converter/player-web", () => ({
    AUDIO_ONLY_ANGLE_ID: "__audio__",
    isYouTubeUrl: () => false,
    findPreferredTrack: () => undefined,
    LuminaryPlayer: { name: "LuminaryPlayer", render: () => null },
}));
vi.mock("@/media-player/player", () => import("@luminary-media-converter/player-web"));
vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({ bucketBaseUrl: computed(() => "https://bucket.example.com") }),
}));
vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    fetchHlsKey: fetchHlsKeyMock,
}));
vi.mock("@/recommendation/affinityStore", () => ({ recordAffinity: vi.fn() }));
vi.mock("@/recommendation/defaultAffinityStore", () => ({
    affinityConfig: computed(() => ({
        eventWeight: { completion: 5 },
        mediaCompletionPercent: 90,
    })),
}));
vi.mock("@/userActivity/store", () => ({ ensureUserActivity: vi.fn() }));

/** The native player as far as the page sees it: its props, its events, and a handle with reactive state. */
const NativeStub = {
    name: "NativeStub",
    props: {
        source: { type: Object, required: true },
        preferredLanguage: String,
        controls: Object,
        messages: Object,
        controllerOptions: Object,
        nowPlaying: Object,
        upNext: Array,
        nextUp: Array,
        chapters: { type: Array, default: undefined },
        lazyThumbnails: Boolean,
    },
    emits: ["loadedmetadata", "timeupdate", "ended", "downloadaction"],
    setup(_props: unknown, { expose }: { expose: (exposed: object) => void }) {
        const state = reactive({
            lifecycle: "ready",
            error: null as null | { code: string; cause?: { code: string } },
            playing: false,
            currentTime: 0,
            duration: 0,
            isAudioOnly: false,
            activeAngleId: "angle_0",
            audioTracks: [{ id: "a-en", lang: "en", label: "English" }],
            activeAudioTrackId: "a-en",
        });
        const held = ref(false);
        const airPlay = ref(false);
        handleState.current = { state, held, airPlay };
        expose({
            controller: { canCapInPlace: true, setMaxHeight: vi.fn() },
            state,
            get castHeldLocal() {
                return held.value;
            },
            get airPlayActive() {
                return airPlay.value;
            },
            playingHeight: 720,
            play: playMock,
            pause: vi.fn(),
            seek: vi.fn(),
            enterFullscreen: vi.fn(() => Promise.resolve()),
            exitFullscreen: vi.fn(() => Promise.resolve()),
        });
        return () => null;
    },
};

const MEDIA = "/media/abc/master.m3u8";
const content = (overrides: Record<string, unknown> = {}) =>
    ({
        ...mockEnglishContentDto,
        parentMediaBucketId: "bucket-1",
        parentMedia: { hlsUrl: MEDIA, hlsKey_id: "key-1" },
        video: undefined,
        ...overrides,
    }) as any;
const mediaId = () => mediaSourceFor(content())!;
const contentId = mockEnglishContentDto._id;
const parentId = mockEnglishContentDto.parentId;

/** Chapters 0–8 and 20–72 stored of an 80 s item. */
const EXAMPLE_SPANS = [
    { fullStart: 0, fullEnd: 8, localStart: 0 },
    { fullStart: 20, fullEnd: 72, localStart: 8 },
];
/** The same shape at a scale past the minimum saved position. */
const WIDE_SPANS = [
    { fullStart: 0, fullEnd: 100, localStart: 0 },
    { fullStart: 200, fullEnd: 500, localStart: 100 },
];
const WIDE_CHAPTERS = [
    { startTime: 0, endTime: 100 },
    { startTime: 100, endTime: 200 },
    { startTime: 200, endTime: 500 },
    { startTime: 500, endTime: 600 },
];

async function mountWith(
    service: DownloadsService | undefined,
    { playsDownloads = true }: { playsDownloads?: boolean } = {},
    overrides: Record<string, unknown> = {},
    props: Record<string, unknown> = {},
) {
    const provide: Record<symbol, unknown> = {
        [VideoPlayerKey as symbol]: {
            component: NativeStub,
            acceptsNowPlaying: true,
            ...(playsDownloads ? { playsDownloads: true } : {}),
        },
    };
    if (service) provide[DownloadsKey as symbol] = service;
    const wrapper = mount(MediaPlayerWrapper, {
        props: { content: content(overrides), language: "en", ...props },
        global: { stubs: { LImage: true }, provide },
    });
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await flushPromises();
    return wrapper;
}

const native = (wrapper: any) => wrapper.findComponent({ name: "NativeStub" });
const state = () => handleState.current.state;

/** The player has loaded what it was given, and reports a time on its own timeline. */
async function loaded(wrapper: any) {
    native(wrapper).vm.$emit("loadedmetadata");
    await flushPromises();
}
async function at(wrapper: any, local: number, duration: number) {
    state().currentTime = local;
    native(wrapper).vm.$emit("timeupdate", local, duration);
    await flushPromises();
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    syncContentProgressFromStorage();
    fetchHlsKeyMock.mockResolvedValue("online-key");
    playOnlineOverride.value = null;
    dataSaverOverride.value = null;
    playerNotice.value = null;
});

/** Mounts with the open left pending, for what happens while it is awaited. */
function mountPending(service: ReturnType<typeof downloadsServiceStub>) {
    return mount(MediaPlayerWrapper, {
        props: { content: content(), language: "en" },
        global: {
            stubs: { LImage: true },
            provide: {
                [VideoPlayerKey as symbol]: {
                    component: NativeStub,
                    acceptsNowPlaying: true,
                    playsDownloads: true,
                },
                [DownloadsKey as symbol]: service,
            },
        },
    });
}

/** What a load does to the player's state as it starts: back to 0, paused, until it reports again. */
async function loadStarts() {
    state().currentTime = 0;
    state().playing = false;
    await flushPromises();
}

describe("the test timeline", () => {
    it("follows the engine's rules, value for value", () => {
        const timeline = timelineOf(EXAMPLE_SPANS, 80, ["u0", "u2"]);
        expect([7.5, 8, 12, 20, 72].map((t) => timeline.toLocal(t))).toEqual([
            { local: 7.5, exact: true },
            { local: 8, exact: false },
            { local: 8, exact: false },
            { local: 8, exact: true },
            { local: 0, exact: false },
        ]);
        expect([7.999, 8, 19.5, 65, -1].map((l) => timeline.toFull(l))).toEqual([
            7.999, 20, 31.5, 72, 0,
        ]);
        expect([5, 65, 12, 75, 40].map((p) => timeline.resumeLocal(p))).toEqual([0, 23, 8, 0, 8]);
        const chapters = [
            { startTime: 0, endTime: 6, unitIds: ["u0"] },
            { startTime: 6, endTime: 14, unitIds: ["u1"] },
            { startTime: 22, endTime: 72, unitIds: ["u2"] },
            { startTime: 72, endTime: 80, unitIds: ["u3"] },
        ];
        expect(chapters.map((c) => timeline.chapter(c))).toEqual([
            { startTime: 0, endTime: 6, available: true },
            { startTime: 8, endTime: 8, available: false },
            { startTime: 10, endTime: 60, available: true },
            { startTime: 60, endTime: 60, available: false },
        ]);
        const empty = timelineOf([], 80);
        expect([empty.toFull(5), empty.resumeLocal(5), empty.localDuration]).toEqual([0, 0, 0]);
    });
});

describe("MediaPlayerWrapper with downloads", () => {
    describe("without a service, or with a player that plays no downloads", () => {
        it("streams with no service at all", async () => {
            const wrapper = await mountWith(undefined);

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toBe("https://bucket.example.com/media/abc/master.m3u8");
            expect(source.keyHex).toBe("online-key");
            expect(native(wrapper).props("chapters")).toBeUndefined();
        });

        it("never asks the service when the player cannot play a download", async () => {
            const service = downloadsServiceStub({ playable: [parentId] });
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(EXAMPLE_SPANS, 80)));

            const wrapper = await mountWith(service, { playsDownloads: false });

            expect(service.hooks.open).not.toHaveBeenCalled();
            expect(native(wrapper).props("source").masterUrl).toContain("https://");
        });

        it("opens the next item through the service once the player says it plays downloads", async () => {
            const service = downloadsServiceStub({ playable: [parentId] });
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(EXAMPLE_SPANS, 80), { playbackId: "pb-later" }),
            );
            const videoPlayer = reactive({
                component: NativeStub,
                acceptsNowPlaying: true,
                playsDownloads: false,
            });
            const wrapper = mount(MediaPlayerWrapper, {
                props: { content: content(), language: "en" },
                global: {
                    stubs: { LImage: true },
                    provide: {
                        [VideoPlayerKey as symbol]: videoPlayer,
                        [DownloadsKey as symbol]: service,
                    },
                },
            });
            await flushPromises();
            expect(service.hooks.open).not.toHaveBeenCalled();

            videoPlayer.playsDownloads = true;
            await wrapper.setProps({ content: content({ _id: "next-content" }) });
            await flushPromises();
            await new Promise((resolve) => setTimeout(resolve, 200));
            await flushPromises();

            expect(service.hooks.open).toHaveBeenCalledWith(
                expect.objectContaining({ _id: "next-content" }),
                { preferOnline: false },
            );
            expect(native(wrapper).props("source").masterUrl).toContain("pb-later");
            // Its listeners were in place from the start.
            service.hooks.closed("pb-later", "revoked");
            expect(playerNotice.value?.text).toBe("This download is no longer available.");
        });

        it("books progress in the player's own time without a service", async () => {
            const wrapper = await mountWith(undefined);
            await loaded(wrapper);
            await at(wrapper, 90, 300);

            expect(getMediaProgress(mediaId(), contentId)).toBe(90);
            expect(getMediaDuration(mediaId(), contentId)).toBe(300);
        });
    });

    describe("source choice", () => {
        it("plays the download with its own master, key, scrub frames and artwork, and fetches no online key", async () => {
            const service = downloadsServiceStub({ playable: [parentId] });
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(EXAMPLE_SPANS, 80), {
                    playbackId: "pb-a",
                    keyHex: "local-key",
                    thumbnailsUrl: "luminary://offline/pb-a/item/thumbs.vtt",
                    artworkUrl: "luminary://offline/pb-a/item/art/cover.jpg",
                }),
            );

            const wrapper = await mountWith(service);

            expect(service.hooks.open).toHaveBeenCalledWith(
                expect.objectContaining({ _id: contentId }),
                { preferOnline: false },
            );
            const source = native(wrapper).props("source");
            expect(source.masterUrl).toBe("luminary://offline/pb-a/built/master.m3u8");
            expect(source.keyHex).toBe("local-key");
            expect(source.sidecars).toEqual({
                thumbnails: { url: "luminary://offline/pb-a/item/thumbs.vtt" },
            });
            expect(source.maxHeight).toBeUndefined();
            expect(native(wrapper).props("nowPlaying").artworkUrl).toBe(
                "luminary://offline/pb-a/item/art/cover.jpg",
            );
            expect(fetchHlsKeyMock).not.toHaveBeenCalled();
        });

        it("asks for the stream when the viewer chose Online on the sheet or in the player", async () => {
            const service = downloadsServiceStub();
            service.hooks.override.value = "online";
            await mountWith(service);
            expect(service.hooks.open).toHaveBeenLastCalledWith(expect.anything(), {
                preferOnline: true,
            });

            service.hooks.override.value = undefined;
            playOnlineOverride.value = true;
            await mountWith(service);
            expect(service.hooks.open).toHaveBeenLastCalledWith(expect.anything(), {
                preferOnline: true,
            });
        });

        it("streams a playable download that does not open online, leaving the notice to the service", async () => {
            const service = downloadsServiceStub({ playable: [parentId] });

            const wrapper = await mountWith(service);

            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(native(wrapper).props("source").keyHex).toBe("online-key");
            expect(playerNotice.value).toBeNull();
        });

        it("says nothing when there is no download to play", async () => {
            await mountWith(downloadsServiceStub());
            expect(playerNotice.value).toBeNull();
        });

        it("offline, leaves a download that will not open to the stream's own failure, with no fallback notice", async () => {
            const service = downloadsServiceStub({
                playable: [parentId],
                network: { online: false, metered: false },
            });
            service.hooks.open.mockRejectedValue(Object.assign(new Error("x"), { code: "io" }));

            const wrapper = await mountWith(service);

            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(playerNotice.value).toBeNull();
        });

        describe("the picture asked for over a download of the sound only", () => {
            async function playingSoundDownload(online: boolean) {
                const entry = {
                    ...entryOf(parentId, WIDE_CHAPTERS, [0, 1, 2, 3]),
                    selection: { kind: "audio" as const, audioLanguage: "eng" },
                };
                const service = downloadsServiceStub({
                    entries: [entry],
                    playable: [parentId],
                    network: { online, metered: false },
                });
                service.hooks.open.mockResolvedValue(
                    playbackOf(timelineOf([{ fullStart: 0, fullEnd: 600, localStart: 0 }], 600)),
                );
                const wrapper = await mountWith(service);
                state().activeAngleId = "audio-only";
                await loaded(wrapper);
                await at(wrapper, 120, 600);
                return wrapper;
            }

            it("online, offers the picture and streams it from the same word on the default camera", async () => {
                const wrapper = await playingSoundDownload(true);
                const vm = wrapper.vm as any;
                expect(vm.streamOffersVideo).toBe(true);

                expect(vm.streamForVideo()).toBe(true);
                await flushPromises();

                const source = native(wrapper).props("source");
                expect(source.masterUrl).toContain("https://");
                expect(source.startPosition).toBe(120);
                expect(source.startAngleId).toBeUndefined();
                expect(playOnlineOverride.value).toBe(true);
            });

            it("offline, offers no picture and keeps playing the download", async () => {
                const wrapper = await playingSoundDownload(false);
                const vm = wrapper.vm as any;
                expect(vm.streamOffersVideo).toBe(false);
                expect(vm.streamForVideo()).toBe(false);
                expect(native(wrapper).props("source").masterUrl).toContain("luminary://offline/");
            });

            it("offers nothing over a download that holds the picture", async () => {
                const service = downloadsServiceStub({
                    entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 1, 2, 3])],
                    playable: [parentId],
                });
                service.hooks.open.mockResolvedValue(
                    playbackOf(timelineOf([{ fullStart: 0, fullEnd: 600, localStart: 0 }], 600)),
                );
                const wrapper = await mountWith(service);
                expect((wrapper.vm as any).streamOffersVideo).toBe(false);
            });
        });

        it("raises no fallback notice for an open another item superseded", async () => {
            const service = downloadsServiceStub({ playable: [parentId] });
            let resolve!: (value: null) => void;
            service.hooks.open.mockReturnValueOnce(new Promise((r) => (resolve = r)));
            const wrapper = mountPending(service);
            await flushPromises();
            await wrapper.setProps({
                content: content({ _id: "other-content", parentId: "other-parent" }),
            });
            resolve(null);
            await flushPromises();
            await new Promise((r) => setTimeout(r, 200));

            expect(playerNotice.value).toBeNull();
        });

        it("closes a session opened while the player went away", async () => {
            const service = downloadsServiceStub();
            const first = playbackOf(timelineOf(EXAMPLE_SPANS, 80));
            let resolve!: (value: typeof first) => void;
            service.hooks.open.mockReturnValueOnce(new Promise((r) => (resolve = r)));
            const wrapper = mountPending(service);
            await flushPromises();
            wrapper.unmount();
            resolve(first);
            await flushPromises();

            expect(first.close).toHaveBeenCalled();
        });

        it("closes a session not yet handed over when another item takes the player", async () => {
            vi.mocked(fallbackArtworkDataUrl).mockReturnValueOnce(new Promise(() => undefined));
            const service = downloadsServiceStub();
            const first = playbackOf(timelineOf(EXAMPLE_SPANS, 80));
            service.hooks.open.mockResolvedValueOnce(first);
            const wrapper = mountPending(service);
            await flushPromises();
            expect((wrapper.vm as any).playback?.playbackId).toBe(first.playbackId);

            await wrapper.setProps({ content: content({ _id: "other-content" }) });
            await flushPromises();

            expect(first.close).toHaveBeenCalled();
        });

        it("closes nothing it handed to the player when it goes", async () => {
            const service = downloadsServiceStub();
            const first = playbackOf(timelineOf(EXAMPLE_SPANS, 80));
            service.hooks.open.mockResolvedValueOnce(first);
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").masterUrl).toBe(first.masterUrl);

            wrapper.unmount();
            await flushPromises();

            expect(first.close).not.toHaveBeenCalled();
        });

        it("opens the download at the same word when the viewer picks it on the sheet while it streams", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 250, 600);
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-picked" }),
            );

            const answers = await service.hooks.sourceChosen(parentId, "downloaded");
            await flushPromises();

            expect(answers).toEqual([true]);
            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-picked");
            expect(source.startPosition).toBe(150);
            expect(playOnlineOverride.value).toBe(false);
        });

        it("answers false and streams on when the download picked on the sheet does not open", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 250, 600);
            const streamed = native(wrapper).props("source").masterUrl;

            service.hooks.open.mockRejectedValueOnce(
                Object.assign(new Error("io"), { code: "io" }),
            );
            const rejected = await service.hooks.sourceChosen(parentId, "downloaded");
            await flushPromises();
            service.hooks.open.mockResolvedValueOnce(null);
            const declined = await service.hooks.sourceChosen(parentId, "downloaded");
            await flushPromises();

            expect(rejected).toEqual([false]);
            expect(declined).toEqual([false]);
            expect(native(wrapper).props("source").masterUrl).toBe(streamed);
            expect(playOnlineOverride.value).toBeNull();
        });

        /** A paused stream, and a Downloaded pick on the sheet whose open waits for `settle`. */
        async function pickPending() {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 250, 600);
            let settle!: (value: DownloadPlayback | null) => void;
            service.hooks.open.mockReturnValueOnce(new Promise((r) => (settle = r)));
            const answers = service.hooks.sourceChosen(parentId, "downloaded");
            await flushPromises();
            return { service, wrapper, answers, settle };
        }

        it("opens nothing more while the download picked on the sheet opens, and plays the pick", async () => {
            const { service, wrapper, answers, settle } = await pickPending();
            const opens = service.hooks.open.mock.calls.length;

            service.hooks.moreReady(parentId);
            await flushPromises();
            expect(service.hooks.open).toHaveBeenCalledTimes(opens);

            settle(playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-picked" }));
            expect(await answers).toEqual([true]);
            await new Promise((r) => setTimeout(r));
            await flushPromises();

            // The session the pick opened holds what became ready.
            expect(service.hooks.open).toHaveBeenCalledTimes(opens);
            expect(native(wrapper).props("source").masterUrl).toContain("pb-picked");
            expect(playerNotice.value).toBeNull();
        });

        it("decides on what became ready once the download picked on the sheet failed to open", async () => {
            const { service, wrapper, answers, settle } = await pickPending();
            const opens = service.hooks.open.mock.calls.length;
            service.hooks.moreReady(parentId);
            await flushPromises();
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-more" }),
            );

            settle(null);
            expect(await answers).toEqual([false]);
            expect(service.hooks.open).toHaveBeenCalledTimes(opens);
            await new Promise((r) => setTimeout(r));
            await flushPromises();

            // Paused, with nothing chosen against the download, it switches as more being ready does.
            expect(service.hooks.open).toHaveBeenCalledTimes(opens + 1);
            expect(native(wrapper).props("source").masterUrl).toContain("pb-more");
        });

        it("opens nothing more when an earlier pick fails while a later one still opens, and plays the later", async () => {
            const { service, wrapper, answers, settle } = await pickPending();
            service.hooks.moreReady(parentId);
            await flushPromises();
            let settleLater!: (value: DownloadPlayback | null) => void;
            service.hooks.open.mockReturnValueOnce(new Promise((r) => (settleLater = r)));
            const later = service.hooks.sourceChosen(parentId, "downloaded");
            await flushPromises();
            const opens = service.hooks.open.mock.calls.length;

            settle(null);
            expect(await answers).toEqual([false]);
            await new Promise((r) => setTimeout(r));
            await flushPromises();
            // The later pick still opens: another open now would supersede it.
            expect(service.hooks.open).toHaveBeenCalledTimes(opens);

            settleLater(playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-later" }));
            expect(await later).toEqual([true]);
            await new Promise((r) => setTimeout(r));
            await flushPromises();
            expect(service.hooks.open).toHaveBeenCalledTimes(opens);
            expect(native(wrapper).props("source").masterUrl).toContain("pb-later");
        });

        it("leaves Data Saver's cap alone while a download plays", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            const setMaxHeight = (wrapper.vm as any).player.controller.setMaxHeight;

            dataSaverOverride.value = true;
            await flushPromises();

            expect(setMaxHeight).not.toHaveBeenCalled();
            expect((wrapper.vm as any).syncDataSaverCap()).toBe(false);
        });

        it("closes a session the player never loads because another item took it", async () => {
            const service = downloadsServiceStub();
            const first = playbackOf(timelineOf(EXAMPLE_SPANS, 80));
            let resolve!: (value: typeof first) => void;
            service.hooks.open.mockReturnValueOnce(new Promise((r) => (resolve = r)));
            const wrapper = mount(MediaPlayerWrapper, {
                props: { content: content(), language: "en" },
                global: {
                    stubs: { LImage: true },
                    provide: {
                        [VideoPlayerKey as symbol]: {
                            component: NativeStub,
                            acceptsNowPlaying: true,
                            playsDownloads: true,
                        },
                        [DownloadsKey as symbol]: service,
                    },
                },
            });
            await flushPromises();
            await wrapper.setProps({ content: content({ _id: "other-content" }) });
            resolve(first);
            await flushPromises();

            expect(first.close).toHaveBeenCalled();
        });

        it("follows a pick on the sheet while the item is open, at the same word", async () => {
            const service = downloadsServiceStub({ playable: [parentId] });
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);

            const answers = await service.hooks.sourceChosen(parentId, "online");
            await flushPromises();

            expect(answers).toEqual([true]);
            expect(playOnlineOverride.value).toBe(true);
            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(250);
            expect(source.preservePosition).toBeUndefined();
        });

        it("answers false to an Online pick offline, and the download plays on", async () => {
            const service = downloadsServiceStub({
                playable: [parentId],
                network: { online: false, metered: false },
            });
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-kept" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);

            const answers = await service.hooks.sourceChosen(parentId, "online");
            await flushPromises();

            expect(answers).toEqual([false]);
            expect(native(wrapper).props("source").masterUrl).toContain("pb-kept");
            expect(playOnlineOverride.value).toBeNull();
        });

        it("answers false to an Online pick with no stream to load, and the download plays on", async () => {
            const entry = entryOf(parentId, WIDE_CHAPTERS, [0, 2]);
            const service = downloadsServiceStub({ entries: [entry], playable: [parentId] });
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-kept" }),
            );
            const wrapper = await mountWith(
                service,
                {},
                { parentMedia: {}, parentMediaBucketId: undefined },
            );
            await loaded(wrapper);
            await at(wrapper, 150, 400);

            const answers = await service.hooks.sourceChosen(parentId, "online");
            await flushPromises();

            expect(answers).toEqual([false]);
            expect(native(wrapper).props("source").masterUrl).toContain("pb-kept");
            expect(playOnlineOverride.value).toBeNull();
        });
    });

    describe("the timeline at the progress points", () => {
        it("opens a saved position on the same word, with the usual rewind kept inside its run", async () => {
            setMediaProgress(mediaId(), contentId, 65, 80);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(EXAMPLE_SPANS, 80)));

            const wrapper = await mountWith(service);

            expect(native(wrapper).props("source").startPosition).toBe(23);
        });

        it("writes full-item time against the full duration, also on pause and page hide", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);

            await at(wrapper, 150, 400);
            expect(getMediaProgress(mediaId(), contentId)).toBe(250);
            expect(getMediaDuration(mediaId(), contentId)).toBe(600);

            await at(wrapper, 152, 400);
            expect(getMediaProgress(mediaId(), contentId)).toBe(250);
            state().playing = true;
            await flushPromises();
            state().playing = false;
            await flushPromises();
            expect(getMediaProgress(mediaId(), contentId)).toBe(252);

            await at(wrapper, 155, 400);
            Object.defineProperty(document, "visibilityState", {
                value: "hidden",
                configurable: true,
            });
            document.dispatchEvent(new Event("visibilitychange"));
            Object.defineProperty(document, "visibilityState", {
                value: "visible",
                configurable: true,
            });
            expect(getMediaProgress(mediaId(), contentId)).toBe(255);
        });

        it("starts a position the download lacks at the next stored chapter, keeping the saved one until it moves", async () => {
            setMediaProgress(mediaId(), contentId, 150, 600);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);

            expect(native(wrapper).props("source").startPosition).toBe(100);
            await loaded(wrapper);
            await at(wrapper, 100.2, 400);
            state().playing = true;
            await flushPromises();
            state().playing = false;
            await flushPromises();
            expect(getMediaProgress(mediaId(), contentId)).toBe(150);

            await at(wrapper, 112, 400);
            expect(getMediaProgress(mediaId(), contentId)).toBe(212);
        });

        it("records finished only at the end of the full item", async () => {
            const service = downloadsServiceStub();
            const spans = [
                { fullStart: 0, fullEnd: 100, localStart: 0 },
                { fullStart: 200, fullEnd: 600, localStart: 100 },
            ];
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(spans, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 300, 500);
            native(wrapper).vm.$emit("ended");
            await flushPromises();

            expect(isMediaFinished(mediaId(), contentId)).toBe(true);
            expect(getMediaProgress(mediaId(), contentId)).toBe(600);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
            expect(recordAffinity).toHaveBeenCalledTimes(1);
        });

        it("measures the watched fraction in full-item time against the full duration", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            // 95 % of the download's own 400 s, but well short of 90 % of the item's 600 s. Steps of a second, so
            // the tracker counts them as watched rather than as seeks.
            for (let local = 0; local <= 380; local += 1) await at(wrapper, local, 400);

            expect(recordAffinity).not.toHaveBeenCalled();
        });

        it("books nothing of a download that lacks the item's start until a minute of it has played", async () => {
            const spans = [{ fullStart: 1200, fullEnd: 1800, localStart: 0 }];
            markMediaCompleted(mediaId(), contentId, 1800, 2400);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(spans, 2400)));
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").startPosition).toBeUndefined();
            await loaded(wrapper);

            await at(wrapper, 0, 600);
            await at(wrapper, 30, 600);
            expect(getMediaProgress(mediaId(), contentId)).toBe(1800);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);

            await at(wrapper, 61, 600);
            expect(getMediaProgress(mediaId(), contentId)).toBe(1261);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
        });

        it("keeps a finished item finished when its partial download is opened", async () => {
            const spans = [{ fullStart: 1200, fullEnd: 1800, localStart: 0 }];
            setMediaProgress(mediaId(), contentId, 2400, 2400);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(spans, 2400)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 0, 600);

            expect(isMediaFinished(mediaId(), contentId)).toBe(true);
        });
    });

    describe("the completed mark", () => {
        it("is set at the end of a partial download below the finished line, in full-item time", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 300, 400);
            // The last second of what is loaded, as the end detector reads it.
            await at(wrapper, 399.5, 400);

            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);
            expect(isMediaFinished(mediaId(), contentId)).toBe(false);
            expect(getMediaProgress(mediaId(), contentId)).toBe(500);
            expect(getMediaDuration(mediaId(), contentId)).toBe(600);
        });

        it("is set again when the download is played to its end a second time", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 300, 400);
            await at(wrapper, 399.5, 400);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);

            await at(wrapper, 100, 400);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
            expect(getMediaProgress(mediaId(), contentId)).toBe(200);

            await at(wrapper, 399.5, 400);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);
            expect(getMediaProgress(mediaId(), contentId)).toBe(500);
        });

        it("keeps the word the viewer was at when the next video is chosen mid-item", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 200, 400);

            native(wrapper).vm.$emit("nextupselect", "next-id");
            await flushPromises();

            expect(getMediaProgress(mediaId(), contentId)).toBe(300);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);
            expect(recordAffinity).not.toHaveBeenCalled();
        });

        it("keeps the word mid-item even when the download holds the whole item", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 0, fullEnd: 600, localStart: 0 }], 600)),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 300, 600);

            native(wrapper).vm.$emit("nextupselect", "next-id");
            await flushPromises();

            expect(getMediaProgress(mediaId(), contentId)).toBe(300);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);
            expect(isMediaFinished(mediaId(), contentId)).toBe(false);
            expect(recordAffinity).not.toHaveBeenCalled();
        });

        it("books the item finished when the next video is chosen past the finished line", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 0, fullEnd: 600, localStart: 0 }], 600)),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 590, 600);

            native(wrapper).vm.$emit("nextupselect", "next-id");
            await flushPromises();

            expect(isMediaFinished(mediaId(), contentId)).toBe(true);
            expect(getMediaProgress(mediaId(), contentId)).toBe(600);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
        });

        it("scores no completion for the end of a partial download", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 300, 400);
            native(wrapper).vm.$emit("ended");
            await flushPromises();

            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);
            expect(recordAffinity).not.toHaveBeenCalled();
        });

        it("books the last span's end, so a reopen with nothing after it starts over", async () => {
            // Runs of 6.006 s segments, whose conversion back from the download's own time is not exact.
            const spans = [
                { fullStart: 0, fullEnd: 1165.1639999999984, localStart: 0 },
                {
                    fullStart: 1567.5660000000041,
                    fullEnd: 2504.502,
                    localStart: 1165.1639999999984,
                },
            ];
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(spans, 3000)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 300, 2102.1);
            native(wrapper).vm.$emit("ended");
            await flushPromises();
            expect(getMediaProgress(mediaId(), contentId)).toBe(2504.502);

            // A position a rounding step short of the end still holds nothing after it.
            markMediaCompleted(mediaId(), contentId, 2504.5019999999995, 3000);
            const reopened = await mountWith(service);
            expect(native(reopened).props("source").startPosition).toBeUndefined();
        });

        it("is cleared by the next write that is not an end", async () => {
            markMediaCompleted(mediaId(), contentId, 500, 600);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);

            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
        });

        it("reopens at the saved position when the download now holds more after it", async () => {
            markMediaCompleted(mediaId(), contentId, 300, 600);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));

            const wrapper = await mountWith(service);

            expect(native(wrapper).props("source").startPosition).toBe(170);
        });

        it("starts the download from its beginning when nothing follows the saved position", async () => {
            markMediaCompleted(mediaId(), contentId, 500, 600);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));

            const wrapper = await mountWith(service);

            expect(native(wrapper).props("source").startPosition).toBeUndefined();
        });

        it("resumes the stream as usual, which holds the rest of the item", async () => {
            markMediaCompleted(mediaId(), contentId, 500, 600);

            const wrapper = await mountWith(downloadsServiceStub());

            expect(native(wrapper).props("source").startPosition).toBe(470);
        });
    });

    describe("a download whose content doc is not on the device", () => {
        it("plays its stand-in on, resuming and booking under the address the download kept", async () => {
            setMediaProgress(mediaId(), contentId, 300, 600);
            const entry = entryOf(parentId, WIDE_CHAPTERS, [0, 2]);
            entry.content = { ...entry.content, contentId, mediaId: MEDIA };
            const service = downloadsServiceStub({ entries: [entry] });
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));

            const wrapper = await mountWith(
                service,
                {},
                { parentMedia: {}, parentMediaBucketId: undefined },
                { autoplay: true },
            );

            expect(native(wrapper).props("source").startPosition).toBe(170);
            expect(native(wrapper).props("nowPlaying").progressKey).toBe(
                mediaProgressKey(MEDIA, contentId),
            );
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalled();

            await at(wrapper, 250, 400);
            expect(getMediaProgress(MEDIA, contentId)).toBe(350);
            await at(wrapper, 399.5, 400);
            expect(isMediaCompleted(MEDIA, contentId)).toBe(true);
            expect(getMediaProgress(MEDIA, contentId)).toBe(500);
        });

        it("still autoplays a stand-in whose download kept no address", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));

            const wrapper = await mountWith(
                service,
                {},
                { parentMedia: {}, parentMediaBucketId: undefined },
                { autoplay: true },
            );
            await loaded(wrapper);

            expect(playMock).toHaveBeenCalled();
            expect(native(wrapper).props("nowPlaying").progressKey).toBeUndefined();
        });
    });

    describe("the chapters", () => {
        it("lists every chapter on the download's timeline, those it lacks unavailable", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600, ["u0", "u2"])),
            );

            const wrapper = await mountWith(service);

            expect(native(wrapper).props("chapters")).toEqual([
                { title: "Chapter 1", startTime: 0, endTime: 100, available: true },
                { title: "Chapter 2", startTime: 100, endTime: 100, available: false },
                { title: "Chapter 3", startTime: 100, endTime: 400, available: true },
                { title: "Chapter 4", startTime: 400, endTime: 400, available: false },
            ]);
        });

        it("binds none while the item streams", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0])],
            });
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("chapters")).toBeUndefined();
        });
    });

    describe("the switch when more is ready", () => {
        async function playingDownload(done = [0, 2]) {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, done)],
            });
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-old" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);
            const more = playbackOf(
                timelineOf(
                    [
                        { fullStart: 0, fullEnd: 500, localStart: 0 },
                        { fullStart: 500, fullEnd: 600, localStart: 500 },
                    ],
                    600,
                ),
                { playbackId: "pb-new" },
            );
            service.hooks.open.mockResolvedValue(more);
            return { service, wrapper };
        }

        it("not playing, switches by itself at the same word and stays paused", async () => {
            const { service, wrapper } = await playingDownload();
            state().activeAngleId = "angle_2";

            service.hooks.moreReady(parentId);
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toBe("luminary://offline/pb-new/built/master.m3u8");
            expect(source.startPosition).toBe(250);
            expect(source.preservePosition).toBeUndefined();
            expect(source.startAngleId).toBe("angle_2");
            await loaded(wrapper);
            expect(playMock).not.toHaveBeenCalled();
        });

        it("ignores the old load's last times while the new one loads, then books the new timeline", async () => {
            const { service, wrapper } = await playingDownload();
            service.hooks.moreReady(parentId);
            await flushPromises();

            await at(wrapper, 120, 400);
            expect(getMediaProgress(mediaId(), contentId)).toBe(250);
            await loaded(wrapper);
            await at(wrapper, 260, 600);
            expect(getMediaProgress(mediaId(), contentId)).toBe(260);
        });

        it("playing, asks first; accepting switches and plays on once loaded", async () => {
            const { service, wrapper } = await playingDownload();
            state().playing = true;
            await flushPromises();

            service.hooks.moreReady(parentId);
            await flushPromises();
            expect(service.hooks.open).toHaveBeenCalledTimes(1);
            expect(playerNotice.value?.text).toBe("More chapters are ready.");
            expect(playerNotice.value?.action?.label).toBe("Switch now");

            actOnPlayerNotice(playerNotice.value!.id);
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-new");
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalled();
        });

        it("playing, declined, switches at the next pause", async () => {
            const { service, wrapper } = await playingDownload();
            state().playing = true;
            await flushPromises();
            service.hooks.moreReady(parentId);
            await flushPromises();
            dismissPlayerNotice(playerNotice.value!.id);
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-old");

            state().playing = false;
            await flushPromises();

            expect(native(wrapper).props("source").masterUrl).toContain("pb-new");
        });

        it("keeps the word and the play state when more is ready again while a switch still loads", async () => {
            const { service, wrapper } = await playingDownload();
            state().playing = true;
            await flushPromises();
            service.hooks.moreReady(parentId);
            await flushPromises();
            actOnPlayerNotice(playerNotice.value!.id);
            await flushPromises();
            await loadStarts();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 0, fullEnd: 600, localStart: 0 }], 600), {
                    playbackId: "pb-third",
                }),
            );

            service.hooks.moreReady(parentId);
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-third");
            expect(source.startPosition).toBe(250);
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalled();
        });

        it("switches at the resume point when more is ready before the first load reports a time", async () => {
            setMediaProgress(mediaId(), contentId, 300, 600);
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [])],
            });
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").startPosition).toBe(270);
            service.entriesRef.value = [entryOf(parentId, WIDE_CHAPTERS, [2])];
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 200, fullEnd: 500, localStart: 0 }], 600), {
                    playbackId: "pb-stored",
                }),
            );

            service.hooks.moreReady(parentId);
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-stored");
            expect(source.startPosition).toBe(70);
        });

        it("resolves a saved position still held on the new copy, which now holds it", async () => {
            setMediaProgress(mediaId(), contentId, 150, 600);
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValueOnce(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").startPosition).toBe(100);
            await loaded(wrapper);
            await at(wrapper, 100, 400);
            service.entriesRef.value = [entryOf(parentId, WIDE_CHAPTERS, [0, 1, 2])];
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 0, fullEnd: 500, localStart: 0 }], 600), {
                    playbackId: "pb-all",
                }),
            );

            service.hooks.moreReady(parentId);
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-all");
            expect(source.startPosition).toBe(120);
            expect(getMediaProgress(mediaId(), contentId)).toBe(150);
        });

        it("closes the new session when the player goes while it opens", async () => {
            const { service, wrapper } = await playingDownload();
            const more = playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-late" });
            let resolve!: (value: typeof more) => void;
            service.hooks.open.mockReturnValueOnce(new Promise((r) => (resolve = r)));
            service.hooks.moreReady(parentId);
            await flushPromises();

            wrapper.unmount();
            resolve(more);
            await flushPromises();

            expect(more.close).toHaveBeenCalled();
        });

        it("streams from the switched position when the switched copy fails to load", async () => {
            const { service, wrapper } = await playingDownload();
            service.hooks.moreReady(parentId);
            await flushPromises();
            await loadStarts();

            state().error = { code: "offline-missing" };
            state().lifecycle = "error";
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(250);
        });

        it("waits for the viewer's real pause when the player starts a load of its own after asking", async () => {
            const { service, wrapper } = await playingDownload();
            state().playing = true;
            await flushPromises();
            service.hooks.moreReady(parentId);
            await flushPromises();
            expect(playerNotice.value?.text).toBe("More chapters are ready.");

            // The player's own load (a late key, its retry) resets it to 0 and paused in one change.
            state().lifecycle = "loading";
            state().currentTime = 0;
            state().playing = false;
            await flushPromises();
            expect(service.hooks.open).toHaveBeenCalledTimes(1);
            expect(native(wrapper).props("source").masterUrl).toContain("pb-old");

            state().lifecycle = "ready";
            await at(wrapper, 150, 400);
            state().playing = true;
            await flushPromises();
            state().playing = false;
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-new");
            expect(source.startPosition).toBe(250);
        });

        it("offers nothing while the viewer chose Online", async () => {
            const { service } = await playingDownload();
            playOnlineOverride.value = true;
            service.hooks.moreReady(parentId);
            await flushPromises();
            expect(service.hooks.open).toHaveBeenCalledTimes(1);
            expect(playerNotice.value).toBeNull();
        });

        it("moves a streamed item onto the download once the chapter playing is stored", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [])],
            });
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 250, 600);

            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 200, fullEnd: 500, localStart: 0 }], 600), {
                    playbackId: "pb-stored",
                }),
            );
            // Not yet: the chapter playing is still to come.
            service.hooks.moreReady(parentId);
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("https://");

            service.entriesRef.value = [entryOf(parentId, WIDE_CHAPTERS, [2])];
            service.hooks.moreReady(parentId);
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-stored");
            expect(source.startPosition).toBe(50);
        });
    });

    describe("a stream sent to a cast or AirPlay video device", () => {
        async function castStream() {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [2])],
            });
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 250, 600);
            handleState.current.airPlay.value = true;
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 200, fullEnd: 500, localStart: 0 }], 600), {
                    playbackId: "pb-stored",
                }),
            );
            return { service, wrapper };
        }

        it("stays on the device when more is ready while paused", async () => {
            const { service, wrapper } = await castStream();

            service.hooks.moreReady(parentId);
            await flushPromises();

            expect(service.hooks.open).toHaveBeenCalledTimes(1);
            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(playerNotice.value).toBeNull();
        });

        it("asks nothing when more is ready while playing, and does not switch at the pause", async () => {
            const { service, wrapper } = await castStream();
            state().playing = true;
            await flushPromises();

            service.hooks.moreReady(parentId);
            await flushPromises();
            expect(playerNotice.value).toBeNull();
            state().playing = false;
            await flushPromises();

            expect(service.hooks.open).toHaveBeenCalledTimes(1);
            expect(native(wrapper).props("source").masterUrl).toContain("https://");
        });

        it("keeps sound alone on the device too, since a load from disk would end the cast", async () => {
            const { service, wrapper } = await castStream();
            state().isAudioOnly = true;

            service.hooks.moreReady(parentId);
            await flushPromises();

            expect(service.hooks.open).toHaveBeenCalledTimes(1);
            expect(native(wrapper).props("source").masterUrl).toContain("https://");
        });
    });

    describe("a session the engine closes", () => {
        async function closedWhile(online: boolean) {
            const service = downloadsServiceStub({ network: { online, metered: false } });
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-x" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);
            service.hooks.closed("pb-x", "revoked");
            await flushPromises();
            return { service, wrapper };
        }

        it("stops booking it and says why, offering the stream online", async () => {
            const { wrapper } = await closedWhile(true);

            expect(playerNotice.value?.text).toBe("This download is no longer available.");
            expect(playerNotice.value?.action?.label).toBe("Play online");
            await at(wrapper, 160, 400);
            expect(getMediaProgress(mediaId(), contentId)).toBe(250);

            actOnPlayerNotice(playerNotice.value!.id);
            await flushPromises();
            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(250);
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalled();
        });

        it("streams the item when the viewer tries again online", async () => {
            const { wrapper } = await closedWhile(true);
            playerNotice.value = null;
            state().error = { code: "offline-revoked" };
            state().lifecycle = "error";
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-x");

            state().lifecycle = "loading";
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(250);
        });

        it("offline, only says why", async () => {
            const { wrapper } = await closedWhile(false);

            expect(playerNotice.value?.text).toBe("This download is no longer available.");
            expect(playerNotice.value?.action).toBeUndefined();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-x");
        });

        it("names a storage card taken out", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-y" }),
            );
            await mountWith(service);
            service.hooks.closed("pb-y", "volume-unavailable");
            expect(playerNotice.value?.text).toBe(
                "The storage card holding this download was removed.",
            );
        });

        it("opens the download again where it stopped when the viewer picks it on the sheet", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-y" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);
            service.hooks.closed("pb-y", "volume-unavailable");
            await flushPromises();
            state().currentTime = 0;

            // The card is back, so the download plays again.
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-again" }),
            );
            const answers = await service.hooks.sourceChosen(parentId, "downloaded");
            await flushPromises();

            expect(answers).toEqual([true]);
            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-again");
            expect(source.startPosition).toBe(150);
        });

        it("answers false to a pick of the download it cannot open again after the engine closed it", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-y" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            service.hooks.closed("pb-y", "volume-unavailable");
            await flushPromises();

            service.hooks.open.mockResolvedValueOnce(null);
            const answers = await service.hooks.sourceChosen(parentId, "downloaded");
            await flushPromises();

            expect(answers).toEqual([false]);
            expect(native(wrapper).props("source").masterUrl).toContain("pb-y");
        });

        it("ignores a session it is not playing", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            await mountWith(service);
            service.hooks.closed("someone-else", "revoked");
            expect(playerNotice.value).toBeNull();
        });
    });

    describe("a download that fails to play", () => {
        it("streams instead online, with the fallback notice", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);

            state().error = { code: "offline-missing" };
            state().lifecycle = "error";
            await flushPromises();

            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(native(wrapper).props("source").startPosition).toBe(250);
            expect(playerNotice.value?.text).toBe(
                "Playing online: the download could not be played",
            );
        });

        it("plays the stream on when the download was playing as it failed", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);
            state().playing = true;
            await flushPromises();

            state().error = { code: "offline-missing" };
            state().lifecycle = "error";
            await flushPromises();
            await loaded(wrapper);

            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(playMock).toHaveBeenCalled();
        });

        it("leaves a revoked one to the engine's close, which says why when it arrives after the error", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-r" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);

            state().error = { code: "media", cause: { code: "offline-revoked" } };
            state().lifecycle = "error";
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-r");
            expect(playerNotice.value).toBeNull();
            expect(playOnlineOverride.value).toBeNull();

            service.hooks.closed("pb-r", "revoked");
            await flushPromises();

            expect(native(wrapper).props("source").masterUrl).toContain("pb-r");
            expect(playerNotice.value?.text).toBe("This download is no longer available.");
            actOnPlayerNotice(playerNotice.value!.id);
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(native(wrapper).props("source").startPosition).toBe(250);
        });

        it("falls back to nothing when the engine's close arrives before the player's error", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-r" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);

            service.hooks.closed("pb-r", "revoked");
            await flushPromises();
            state().error = { code: "media" };
            state().lifecycle = "error";
            await flushPromises();

            expect(native(wrapper).props("source").masterUrl).toContain("pb-r");
            expect(playerNotice.value?.text).toBe("This download is no longer available.");
            expect(playOnlineOverride.value).toBeNull();
        });

        it("still says why when the engine closes a session a fallback has just replaced", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-r" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);
            state().error = { code: "media" };
            state().lifecycle = "error";
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("https://");

            service.hooks.closed("pb-r", "revoked");
            await flushPromises();

            expect(playerNotice.value?.text).toBe("This download is no longer available.");
            expect(playerNotice.value?.action).toBeUndefined();
            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(native(wrapper).props("source").startPosition).toBe(250);
        });
    });

    describe("casting a download", () => {
        async function casting(online: boolean) {
            const service = downloadsServiceStub({ network: { online, metered: false } });
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);
            return { wrapper };
        }

        it("online, loads the stream at the same position for the cast", async () => {
            const { wrapper } = await casting(true);
            state().playing = true;
            handleState.current.held.value = true;
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(250);
            expect(playOnlineOverride.value).toBe(true);
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalled();
        });

        it("offline, says casting is not available and changes nothing", async () => {
            const { wrapper } = await casting(false);
            handleState.current.held.value = true;
            await flushPromises();

            expect(playerNotice.value?.text).toBe("Casting is not available offline");
            expect(native(wrapper).props("source").masterUrl).toContain("luminary://offline/");
        });

        it("streams from the resume point for a device chosen before the download's load reports", async () => {
            setMediaProgress(mediaId(), contentId, 300, 600);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").startPosition).toBe(170);

            handleState.current.held.value = true;
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(270);
        });

        it("streams an item opened as sound when a device is already chosen", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service, {}, {}, { startAudio: true });

            handleState.current.held.value = true;
            await flushPromises();

            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(playOnlineOverride.value).toBe(true);
        });

        it("offline, says casting is not available while only the sound plays too", async () => {
            const { wrapper } = await casting(false);
            state().isAudioOnly = true;
            handleState.current.held.value = true;
            await flushPromises();

            expect(playerNotice.value?.text).toBe("Casting is not available offline");
            expect(native(wrapper).props("source").masterUrl).toContain("luminary://offline/");
        });

        it("online, loads the stream for the cast with the sound alone too", async () => {
            const { wrapper } = await casting(true);
            state().isAudioOnly = true;
            handleState.current.held.value = true;
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(250);
            expect(playOnlineOverride.value).toBe(true);
        });
    });

    describe("the stream taking over while the saved position is still held", () => {
        /** Saved at 150, in a chapter the download lacks: it opens at local 100 (full 200) and holds 150. */
        async function heldAtPlaceholder() {
            setMediaProgress(mediaId(), contentId, 150, 600);
            const service = downloadsServiceStub({ playable: [parentId] });
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-held" }),
            );
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").startPosition).toBe(100);
            await loaded(wrapper);
            await at(wrapper, 100.2, 400);
            return { service, wrapper };
        }

        it("casts from the saved position, which the stream holds", async () => {
            const { wrapper } = await heldAtPlaceholder();
            handleState.current.held.value = true;
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(120);
            expect(getMediaProgress(mediaId(), contentId)).toBe(150);
        });

        it("streams from the saved position when Online is picked on the sheet", async () => {
            const { service, wrapper } = await heldAtPlaceholder();
            await service.hooks.sourceChosen(parentId, "online");
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(120);
        });

        it("lets go of the saved position once playback moves, also within the first minute", async () => {
            // Nothing stored after the saved position: the download starts from its own beginning.
            setMediaProgress(mediaId(), contentId, 700, 1000);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 1000)));
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").startPosition).toBe(0);
            await loaded(wrapper);
            await at(wrapper, 30, 400);

            handleState.current.held.value = true;
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(30);
        });

        it("streams from the saved position after the engine closed the session", async () => {
            const { service, wrapper } = await heldAtPlaceholder();
            service.hooks.closed("pb-held", "revoked");
            await flushPromises();
            actOnPlayerNotice(playerNotice.value!.id);
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("https://");
            expect(source.startPosition).toBe(120);
        });
    });

    describe("loads the player starts itself", () => {
        it("keep the last real position through the load's reset, for a switch decided during it", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 250, 600);
            // A reload the wrapper did not start (a cap, a late key, the player's retry) resets the time to 0.
            state().lifecycle = "loading";
            await flushPromises();
            await at(wrapper, 0, 0);
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-more" }),
            );

            service.hooks.moreReady(parentId);
            await flushPromises();

            const source = native(wrapper).props("source");
            expect(source.masterUrl).toContain("pb-more");
            expect(source.startPosition).toBe(150);
        });

        it("treat a load told to play as playing before the player reports it, and ask before switching", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-old" }),
            );
            const wrapper = await mountWith(service, {}, {}, { autoplay: true });
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalledTimes(1);
            expect(state().playing).toBe(false);

            service.hooks.moreReady(parentId);
            await flushPromises();

            expect(service.hooks.open).toHaveBeenCalledTimes(1);
            expect(playerNotice.value?.text).toBe("More chapters are ready.");
        });

        it("stop treating a play that never started as playing a few seconds after the load", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-old" }),
            );
            const wrapper = await mountWith(service, {}, {}, { autoplay: true });
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            try {
                await loaded(wrapper);
                expect(playMock).toHaveBeenCalledTimes(1);
                // The viewer paused in the start-up gap: the player never reports playing.
                vi.advanceTimersByTime(3_500);
                service.hooks.open.mockResolvedValue(
                    playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-new" }),
                );

                service.hooks.moreReady(parentId);
                await flushPromises();
            } finally {
                vi.useRealTimers();
            }

            expect(playerNotice.value).toBeNull();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-new");
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalledTimes(1);
        });

        it("stop treating a play as playing once a load of their own ends in an error", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            const wrapper = await mountWith(service, {}, {}, { autoplay: true });
            await loaded(wrapper);
            state().lifecycle = "loading";
            await flushPromises();
            state().error = { code: "network" };
            state().lifecycle = "error";
            await flushPromises();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-new" }),
            );

            service.hooks.moreReady(parentId);
            await flushPromises();

            expect(playerNotice.value).toBeNull();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-new");
        });

        it("stop treating playing as playing when the viewer pauses before a load of their own plays again", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-old" }),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 150, 400);
            state().playing = true;
            await flushPromises();
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            try {
                // The player's own load: back to 0 and paused in one change, then it settles.
                state().lifecycle = "loading";
                state().currentTime = 0;
                state().playing = false;
                await flushPromises();
                state().lifecycle = "ready";
                await flushPromises();
                // The viewer paused before it played again: playing is never reported.
                vi.advanceTimersByTime(10_000);
                service.hooks.open.mockResolvedValue(
                    playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-new" }),
                );

                service.hooks.moreReady(parentId);
                await flushPromises();
            } finally {
                vi.useRealTimers();
            }

            expect(playerNotice.value).toBeNull();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-new");
        });

        it("keep a play that is still buffering past the grace as playing, and play the switch", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-old" }),
            );
            const wrapper = await mountWith(service, {}, {}, { autoplay: true });
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            try {
                await loaded(wrapper);
                expect(playMock).toHaveBeenCalledTimes(1);
                // Ready, and the first frames still arriving: nothing is held ahead of the playhead.
                state().bufferedEnd = state().currentTime;
                vi.advanceTimersByTime(3_500);
                service.hooks.open.mockResolvedValue(
                    playbackOf(timelineOf(WIDE_SPANS, 600), { playbackId: "pb-new" }),
                );

                service.hooks.moreReady(parentId);
                await flushPromises();
            } finally {
                vi.useRealTimers();
            }

            expect(playerNotice.value?.text).toBe("More chapters are ready.");
            actOnPlayerNotice(playerNotice.value!.id);
            await flushPromises();
            expect(native(wrapper).props("source").masterUrl).toContain("pb-new");
            await loaded(wrapper);
            expect(playMock).toHaveBeenCalledTimes(2);
        });
    });

    describe("the first minute of a download played from its start", () => {
        it("counts again when it is replayed from its start after its end", async () => {
            const spans = [{ fullStart: 1200, fullEnd: 1800, localStart: 0 }];
            setMediaProgress(mediaId(), contentId, 1500, 2400);
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(spans, 2400)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 300, 600);
            await at(wrapper, 599.5, 600);
            expect(getMediaProgress(mediaId(), contentId)).toBe(1800);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);

            await at(wrapper, 0, 600);
            await at(wrapper, 1, 600);
            expect(getMediaProgress(mediaId(), contentId)).toBe(1800);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);

            await at(wrapper, 61, 600);
            expect(getMediaProgress(mediaId(), contentId)).toBe(1261);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
        });

        it("carries across a switch of copy, counting what has played rather than the local time", async () => {
            markMediaCompleted(mediaId(), contentId, 500, 600);
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [2])],
            });
            service.hooks.open.mockResolvedValueOnce(
                playbackOf(timelineOf([{ fullStart: 200, fullEnd: 500, localStart: 0 }], 600), {
                    playbackId: "pb-top",
                }),
            );
            const wrapper = await mountWith(service);
            expect(native(wrapper).props("source").startPosition).toBeUndefined();
            await loaded(wrapper);
            await at(wrapper, 0, 300);
            await at(wrapper, 10, 300);
            expect(getMediaProgress(mediaId(), contentId)).toBe(500);

            service.entriesRef.value = [entryOf(parentId, WIDE_CHAPTERS, [1, 2])];
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 100, fullEnd: 500, localStart: 0 }], 600), {
                    playbackId: "pb-more",
                }),
            );
            service.hooks.moreReady(parentId);
            await flushPromises();
            expect(native(wrapper).props("source").startPosition).toBe(110);
            await loaded(wrapper);

            await at(wrapper, 111, 400);
            expect(getMediaProgress(mediaId(), contentId)).toBe(500);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);

            await at(wrapper, 161, 400);
            expect(getMediaProgress(mediaId(), contentId)).toBe(261);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
        });
    });

    describe("the end of a download reached with nothing booked", () => {
        it("leaves the completed mark at the last span's end and scores nothing, short of the finished line", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 399.5, 400);
            native(wrapper).vm.$emit("ended");
            await flushPromises();

            expect(getMediaProgress(mediaId(), contentId)).toBe(500);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(true);
            expect(isMediaFinished(mediaId(), contentId)).toBe(false);
            expect(recordAffinity).not.toHaveBeenCalled();
        });

        it("keeps no position for the end of a download that holds under a minute", async () => {
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(
                playbackOf(timelineOf([{ fullStart: 0, fullEnd: 40, localStart: 0 }], 600)),
            );
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 39.5, 40);
            native(wrapper).vm.$emit("ended");
            await flushPromises();

            expect(getMediaProgress(mediaId(), contentId)).toBe(0);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
        });

        it("finishes the item when the download reaches the end of the full item", async () => {
            const spans = [
                { fullStart: 0, fullEnd: 100, localStart: 0 },
                { fullStart: 200, fullEnd: 600, localStart: 100 },
            ];
            const service = downloadsServiceStub();
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(spans, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);
            await at(wrapper, 499.5, 500);

            expect(isMediaFinished(mediaId(), contentId)).toBe(true);
            expect(getMediaProgress(mediaId(), contentId)).toBe(600);
            expect(isMediaCompleted(mediaId(), contentId)).toBe(false);
        });
    });

    describe("the now-playing screen's download controls", () => {
        it("opens the sheet with what plays as its preselection", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0])],
            });
            const wrapper = await mountWith(service);

            native(wrapper).vm.$emit("downloadaction", { action: "download" });
            native(wrapper).vm.$emit("downloadaction", { action: "chapterDownload", value: "1" });

            const selection = {
                kind: "video",
                angleId: "angle_0",
                qualityId: "720",
                audioLanguage: "en",
            };
            expect(service.openSheet).toHaveBeenCalledWith(
                expect.objectContaining({ _id: contentId }),
                {
                    context: "player",
                    selection,
                },
            );
            expect(service.openSheet).toHaveBeenCalledWith(expect.anything(), {
                context: "player",
                chapter: 1,
                selection,
            });
        });

        it("plays a chapter the download lacks online, from its start", async () => {
            const service = downloadsServiceStub({
                entries: [entryOf(parentId, WIDE_CHAPTERS, [0, 2])],
            });
            service.hooks.open.mockResolvedValue(playbackOf(timelineOf(WIDE_SPANS, 600)));
            const wrapper = await mountWith(service);
            await loaded(wrapper);

            native(wrapper).vm.$emit("downloadaction", { action: "chapterOnline", value: "1" });
            await flushPromises();

            expect(native(wrapper).props("source").masterUrl).toContain("https://");
            expect(native(wrapper).props("source").startPosition).toBe(100);
            // The rest of the item streams too.
            expect(playOnlineOverride.value).toBe(true);
        });

        it("passes on what only the page can do", async () => {
            const wrapper = await mountWith(downloadsServiceStub());
            native(wrapper).vm.$emit("downloadaction", { action: "autoplayMode", value: "all" });
            expect(wrapper.emitted("downloadaction")).toEqual([
                [{ action: "autoplayMode", value: "all" }],
            ]);
        });
    });
});
