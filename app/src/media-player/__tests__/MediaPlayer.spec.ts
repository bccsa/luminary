import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { rgbaToThumbHash } from "thumbhash";
import type { ContentDto } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { dataSaverLevel, subtitlePreference, userDataSaverEnabled } from "@/globalConfig";
import { isPlayerSwap, clearSwaps } from "@/util/playerSwap";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import MediaPlayer from "../MediaPlayer.vue";
import { PlatformChromeKey } from "@/build-time/contracts/platform-chrome/token";
import { ScreenWakeKey } from "@/build-time/contracts/screen-wake/token";
import {
    chosenAudio,
    closeMediaPlayer,
    mediaPlayerItem,
    minimiseMediaPlayer,
    mediaPlayerView,
    openMediaPlayer,
} from "../mediaPlayer";

const AUDIO = "__audio__";

/** The engine `MediaPlayerWrapper` hands the media player: a controller, its state, and the handle. */
const engine = vi.hoisted(() => ({
    state: null as any,
    controller: null as any,
    handle: null as any,
    props: null as any,
    emit: null as any,
    liftDataSaverCap: null as any,
    mounts: 0,
    inlineActive: false,
    canMute: false,
    airPlayAvailable: false,
    castAvailable: false,
    airPlayActive: false,
    thumbnailsReady: false,
    /** The packaged app's native player: it draws its own now-playing screen and turns the picture off in place. */
    native: false as boolean | null,
}));

vi.mock("@luminary-media-converter/player-web", async () => {
    const { defineComponent, h } = await import("vue");
    return {
        AUDIO_ONLY_ANGLE_ID: "__audio__",
        // The strip itself is the player's; what matters here is when the media player shows it.
        ScrubRoster: defineComponent({
            name: "ScrubRoster",
            props: { tiles: Array, markerX: Number, interactive: Boolean, closeLabel: String },
            emits: ["close"],
            setup:
                (props, { emit }) =>
                () =>
                    h("div", { "data-test": "scrubRoster", "data-tiles": props.tiles?.length }, [
                        props.interactive
                            ? h("button", {
                                  "data-test": "mediaPlayerRosterClose",
                                  onClick: () => emit("close"),
                              })
                            : null,
                    ]),
        }),
        ScrubPicture: defineComponent({
            name: "ScrubPicture",
            props: { cue: Object },
            setup: () => () => h("div", { "data-test": "scrubPicture" }),
        }),
        // The real one is player-core's, tested there: the last chapter that has started.
        chapterIndexAt: (chapters: { startTime: number }[], time: number) =>
            chapters.reduce(
                (found, chapter, index) => (chapter.startTime <= time ? index : found),
                -1,
            ),
        chapterSegments: () => [],
        chapterMask: () => "",
        ...(await import("@/media-player/player/ui/chapterSkip")),
        mergeMessages: (messages: object) => messages,
        // The real screen is the player's, tested there: it says what is asked through its events.
        AudioFullscreen: defineComponent({
            name: "AudioFullscreen",
            props: {
                title: String,
                subtitle: String,
                artwork: Object,
                playing: Boolean,
                busy: Boolean,
                live: Boolean,
                currentTime: Number,
                hasBrowse: Boolean,
                chaptersSheet: Boolean,
                fullscreenTool: Boolean,
                fullscreenActive: Boolean,
                appearance: String,
                stage: String,
                fill: Boolean,
                stageHole: Boolean,
                captionBand: Boolean,
                thumbHash: String,
                exitLabel: String,
                subtitleTracks: Array,
                activeSubtitleTrackId: String,
                canPictureInPicture: Boolean,
                lyrics: Array,
            },
            emits: [
                "exit",
                "toggle-play",
                "seek",
                "sleep",
                "rate",
                "seek-chapter",
                "upnextselect",
                "subtitle-track",
                "picture-in-picture",
                "fullscreen",
            ],
            // Its top line and its stage, as the real screen draws them, so a host's switch and engine live in it.
            setup:
                (props, { slots }) =>
                () =>
                    h("div", { "data-test": "audioFullscreenStub" }, [
                        h("div", { class: "lmpl-afs-top", "data-test": "audioFullscreenTop" }, [
                            slots["top-end"]?.(),
                        ]),
                        props.title,
                        slots["under-title"]?.(),
                        slots.sheet?.({ close: () => {} }),
                        slots["audio-tool"]?.(),
                        slots.cast?.(),
                        slots.roster?.(),
                        h("div", { "data-test": "audioFullscreenStage" }, [slots.stage?.()]),
                    ]),
        }),
        rosterStep: () => 4,
        rosterFineStep: () => 1,
        rosterTileWidth: (height: number) => height,
        rosterTiles: (time: number) => [{ index: 0, left: 0, time }],
    };
});

vi.mock("@/util/fallbackArtwork", () => ({
    fallbackImageFor: () => "/stand-in.jpg",
    fallbackArtworkDataUrl: () => Promise.resolve(undefined),
}));
// The app's player UI re-exports the mocked engine's stand-ins.
vi.mock("@/media-player/player", () => import("@luminary-media-converter/player-web"));

const upNextDocs = vi.hoisted(() => ({ value: [] as any[] }));
const categoryDocs = vi.hoisted(() => ({ value: [] as any[] }));
const tagDocs = vi.hoisted(() => ({ value: [] as any[] }));
vi.mock("@/composables/useContentQuery", async () => {
    const { computed } = await import("vue");
    return {
        // Two queries ask for tag documents: the categories (a series) and all of the tags.
        useContentQuery: (selector: () => unknown[]) =>
            computed(() => {
                const text = JSON.stringify(selector());
                if (!text.includes('"parentType"')) return upNextDocs.value;
                return text.includes('"parentTagType"') ? categoryDocs.value : tagDocs.value;
            }),
    };
});

const routerPush = vi.hoisted(() => vi.fn());
const currentRoute = vi.hoisted(() => ({
    value: { name: "home", params: {} as Record<string, string> },
}));
vi.mock("vue-router", () => ({
    useRouter: () => ({
        push: routerPush,
        currentRoute,
        resolve: (to: { params: { slug: string } }) => ({ fullPath: `/${to.params.slug}` }),
    }),
}));

vi.mock("@/media-player/MediaPlayerWrapper.vue", async () => {
    const { defineComponent, h, reactive } = await import("vue");
    return {
        default: defineComponent({
            name: "MediaPlayerWrapper",
            props: {
                content: Object,
                language: String,
                startAudio: Boolean,
                autoplay: Boolean,
                fullscreenOnPlay: Boolean,
                inline: Boolean,
                captionBand: Number,
                windowedControls: Boolean,
                upNext: Array,
                nextUp: Array,
            },
            emits: ["upnextselect", "nextupselect"],
            setup(props, { expose, emit }) {
                engine.emit = emit;
                engine.mounts++;
                engine.props = props;
                engine.state = reactive({
                    lifecycle: "ready",
                    playing: true,
                    currentTime: 30,
                    duration: 120,
                    bufferedEnd: 60,
                    playbackRate: 1,
                    isAudioOnly: false,
                    live: false,
                    activeAngleId: "angle_0",
                    activeQualityId: "auto",
                    qualities: [
                        { id: "q720", height: 720 },
                        { id: "q360", height: 360 },
                    ],
                    angles: [
                        { id: "angle_0", name: "Wide", isDefault: true },
                        { id: AUDIO, name: "Audio only", isDefault: false },
                    ],
                    audioTracks: [
                        { id: "en", lang: "en", label: "English" },
                        { id: "fr", lang: "fr", label: "Français" },
                    ],
                    activeAudioTrackId: "en",
                    muted: false,
                    volume: 0.5,
                    chapters: [] as { startTime: number; endTime: number; title: string }[],
                    subtitleTracks: [
                        { id: "sub-fr", lang: "fr", label: "Français", source: "master" },
                    ],
                    activeSubtitleTrackId: null,
                    sleepTimer: null,
                    thumbnailsReady: engine.thumbnailsReady,
                });
                engine.controller = {
                    thumbnailAt: vi.fn(() =>
                        engine.thumbnailsReady
                            ? { spriteUrl: "blob:sprite", x: 0, y: 0, w: 160, h: 90 }
                            : null,
                    ),
                    setAngle: vi.fn(async (id: string) => {
                        engine.state.activeAngleId = id;
                        engine.state.isAudioOnly = id === AUDIO;
                    }),
                    setPlaybackRate: vi.fn(),
                    setQuality: vi.fn((id: string) => (engine.state.activeQualityId = id)),
                    setSleepTimer: vi.fn(),
                    seek: vi.fn(),
                    setAudioTrack: vi.fn(),
                    setSubtitleTrack: vi.fn(),
                };
                // Reactive, as the real handle's flags are: the page follows a refusal that turns them false.
                engine.handle = reactive({
                    controller: engine.controller,
                    state: engine.state,
                    play: vi.fn(),
                    pause: vi.fn(),
                    seek: vi.fn(),
                    enterFullscreen: vi.fn(),
                    exitFullscreen: vi.fn(),
                    canMute: engine.canMute,
                    canPictureInPicture: engine.canMute,
                    get muted() {
                        return engine.state.muted;
                    },
                    setMuted: vi.fn(),
                    get volume() {
                        return engine.state.volume;
                    },
                    setVolume: vi.fn(),
                    startPictureInPicture: vi.fn(),
                    get airPlayAvailable() {
                        return engine.airPlayAvailable;
                    },
                    get castAvailable() {
                        return engine.castAvailable;
                    },
                    showCastPicker: vi.fn(),
                    get airPlayActive() {
                        return engine.airPlayActive;
                    },
                    showAirPlayPicker: vi.fn(),
                    ...(engine.native
                        ? {
                              nativeNowPlaying: true,
                              showNowPlaying: vi.fn(),
                              hideNowPlaying: vi.fn(),
                              nativeMiniPlayer: true,
                              showMiniPlayer: vi.fn(),
                              setMiniPlayerFrame: vi.fn(),
                              hideMiniPlayer: vi.fn(),
                              canTurnVideoOff: true,
                              setVideoOff: vi.fn(),
                          }
                        : { nativeNowPlaying: engine.native === false ? false : null }),
                });
                expose({
                    liftDataSaverCap: (engine.liftDataSaverCap = vi.fn(() => true)),
                    player: engine.handle,
                    get inlineActive() {
                        return engine.inlineActive;
                    },
                });
                return () => h("div", { class: "video-player-stub" });
            },
        }),
    };
});

const wrappers: VueWrapper[] = [];

async function mountPlayer(provide: Record<symbol, unknown> = {}) {
    const wrapper = mount(MediaPlayer, { global: { stubs: { LImage: true }, provide } });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
}

async function playing() {
    openMediaPlayer(mockEnglishContentDto, "en");
    return mountPlayer();
}

/**
 * The width the spec runs at: the card layout these tests describe is the wide screen's, so that is the default; a
 * phone, where the now-playing screen takes its place, is asked for with `narrow`.
 */
let screenWide = true;
let screenLandscape = false;
let pointerFine = false;
const setupMatchMedia = window.matchMedia;
beforeEach(() => {
    chosenAudio.value = null;
    subtitlePreference.value = { on: false };
    screenWide = true;
    screenLandscape = false;
    pointerFine = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("1024px")
            ? screenWide
            : query.includes("landscape")
              ? screenLandscape
              : query.includes("pointer: fine")
                ? pointerFine
                : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
    window.matchMedia = setupMatchMedia;
});

/** A phone for the length of `run`: the media query for 1024 px and up does not match. */
async function narrow(run: () => Promise<void>) {
    screenWide = false;
    try {
        await run();
    } finally {
        screenWide = true;
    }
}

/** A wide screen for the length of `run`: the media query for 1024 px and up matches. */
async function wide(run: () => Promise<void>) {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("1024px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
        await run();
    } finally {
        window.matchMedia = original;
    }
}

const find = (wrapper: VueWrapper, test: string) => wrapper.find(`[data-test='${test}']`);

beforeEach(() => {
    setActivePinia(createPinia());
    upNextDocs.value = [];
    categoryDocs.value = [];
    tagDocs.value = [];
    routerPush.mockClear();
    engine.mounts = 0;
    engine.inlineActive = false;
    engine.canMute = false;
    engine.airPlayAvailable = false;
    engine.airPlayActive = false;
    engine.thumbnailsReady = false;
    engine.native = false;
    document.documentElement.classList.remove("lmc-inline-video");
    document.documentElement.classList.remove("lmc-player-dragging");
    closeMediaPlayer();
    userDataSaverEnabled.value = false;
});

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("MediaPlayer", () => {
    it("shows nothing while nothing plays", async () => {
        const wrapper = await mountPlayer();
        expect(find(wrapper, "mediaPlayer").exists()).toBe(false);
    });

    it("plays the content opened, starting on the video, autoplaying", async () => {
        const wrapper = await playing();

        expect(find(wrapper, "mediaPlayer").text()).toContain(mockEnglishContentDto.title);
        expect(engine.props.content._id).toBe(mockEnglishContentDto._id);
        expect(engine.props.startAudio).toBe(false);
        expect(engine.props.autoplay).toBe(true);
    });

    it("starts on the sound while Data Saver is on", async () => {
        userDataSaverEnabled.value = true;
        await playing();
        expect(engine.props.startAudio).toBe(true);
    });

    describe("Data Saver mid-play", () => {
        it("caps, never pins: no rendition is held when it goes on, and nothing reloads", async () => {
            dataSaverLevel.value = "off";
            await playing();
            engine.state.lifecycle = "loading";
            await flushPromises();
            engine.state.lifecycle = "ready";
            engine.state.qualities = [...engine.state.qualities];
            dataSaverLevel.value = "light";
            await flushPromises();
            expect(engine.controller.setQuality).not.toHaveBeenCalled();
            expect(engine.liftDataSaverCap).not.toHaveBeenCalled();
        });

        it("lifts the cap when it goes off and leaves the viewer's pick alone", async () => {
            dataSaverLevel.value = "light";
            await playing();
            engine.controller.setQuality("q360");
            dataSaverLevel.value = "off";
            await flushPromises();
            expect(engine.liftDataSaverCap).toHaveBeenCalledTimes(1);
            expect(engine.controller.setQuality).toHaveBeenCalledTimes(1);
            expect(engine.state.activeQualityId).toBe("q360");
        });
    });

    describe("the audio / video switch", () => {
        it("switches to the sound alone", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();

            expect(engine.controller.setAngle).toHaveBeenCalledWith(AUDIO);
            expect(find(wrapper, "mediaPlayerAudio").attributes("aria-pressed")).toBe("true");
        });

        it("switches back to the camera that was playing", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();

            expect(engine.controller.setAngle).toHaveBeenLastCalledWith("angle_0");
        });

        it("switches to the new item's camera, not the last item's, after another item opened as sound", async () => {
            const wrapper = await playing();
            await flushPromises();
            // The next item, from More, has cameras of its own and opens as sound.
            openMediaPlayer({ ...mockEnglishContentDto, _id: "next-item" }, "en", { audio: true });
            engine.state.angles = [
                { id: "cam_main", name: "main", isDefault: true },
                { id: AUDIO, name: "Audio only", isDefault: false },
            ];
            engine.state.activeAngleId = AUDIO;
            await flushPromises();
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();

            expect(engine.controller.setAngle).toHaveBeenLastCalledWith("cam_main");
        });

        it("switches to the camera when it was opened on the sound alone", async () => {
            openMediaPlayer(mockEnglishContentDto, "en", { audio: true });
            const wrapper = await mountPlayer();
            expect(engine.props.startAudio).toBe(true);
            engine.state.activeAngleId = AUDIO;
            await flushPromises();
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();

            expect(engine.controller.setAngle).toHaveBeenLastCalledWith("angle_0");
        });

        it("is not offered when the source has no audio-only angle", async () => {
            const wrapper = await playing();
            engine.state.angles = [{ id: "angle_0", name: "Wide", isDefault: true }];
            await flushPromises();

            expect(find(wrapper, "mediaPlayerAudio").exists()).toBe(false);
        });
    });

    describe("in the packaged app, where the player draws its own now-playing screen", () => {
        beforeEach(() => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            engine.native = true;
        });
        afterEach(() => {
            vi.unstubAllEnvs();
        });

        const nowPlayingHidden = (wrapper: VueWrapper) =>
            (find(wrapper, "mediaPlayerNowPlaying").element as HTMLElement).style.display ===
            "none";

        it("keeps the page's screen out of the way, also while it is minimised", async () =>
            narrow(async () => {
                const wrapper = await playing();
                expect(nowPlayingHidden(wrapper)).toBe(true);
                const sent = engine.handle.showNowPlaying.mock.calls.at(-1)[0];
                expect(sent.itemId).toBe(mockEnglishContentDto._id);

                minimiseMediaPlayer();
                await flushPromises();
                if (find(wrapper, "mediaPlayerNowPlaying").exists())
                    expect(nowPlayingHidden(wrapper)).toBe(true);
            }));

        it("has the platform draw the minimised bar, keeping the page's own in place unseen", async () =>
            narrow(async () => {
                const wrapper = await playing();
                minimiseMediaPlayer();
                await flushPromises();

                const sent = engine.handle.showMiniPlayer.mock.calls.at(-1);
                expect(sent[0]).toMatchObject({ title: mockEnglishContentDto.title, live: false });
                expect(sent[1].close).toBeDefined();
                const anchor = find(wrapper, "mediaPlayerBar");
                expect(anchor.exists()).toBe(true);
                expect(anchor.classes()).toEqual(
                    expect.arrayContaining(["opacity-0", "pointer-events-none"]),
                );
                expect(anchor.attributes("aria-hidden")).toBe("true");
                expect(engine.handle.setMiniPlayerFrame).toHaveBeenCalled();
            }));

        it("follows what the viewer did on the platform's bar", async () =>
            narrow(async () => {
                await playing();
                minimiseMediaPlayer();
                await flushPromises();

                engine.emit("miniplayeraction", "expand");
                await flushPromises();
                expect(mediaPlayerView.value).toBe("expanded");
                expect(engine.handle.hideMiniPlayer).toHaveBeenCalled();

                minimiseMediaPlayer();
                await flushPromises();
                engine.emit("miniplayeraction", "close");
                await flushPromises();
                expect(mediaPlayerItem.value).toBeNull();
            }));

        it("keeps the page's own bar where the player has none", async () =>
            narrow(async () => {
                engine.native = false;
                const wrapper = await playing();
                minimiseMediaPlayer();
                await flushPromises();
                expect(find(wrapper, "mediaPlayerBar").classes()).not.toContain("opacity-0");
            }));

        it("shows the page's screen where the player has none of its own", async () =>
            narrow(async () => {
                engine.native = false;
                const wrapper = await playing();
                expect(nowPlayingHidden(wrapper)).toBe(false);
            }));

        it("takes its screen and bar back when the platform refuses to draw them", async () =>
            narrow(async () => {
                const wrapper = await playing();
                expect(nowPlayingHidden(wrapper)).toBe(true);
                engine.handle.nativeNowPlaying = false;
                await flushPromises();
                expect(nowPlayingHidden(wrapper)).toBe(false);

                engine.handle.nativeMiniPlayer = false;
                minimiseMediaPlayer();
                await flushPromises();
                expect(find(wrapper, "mediaPlayerBar").classes()).not.toContain("opacity-0");
            }));

        it("keeps the page's screen hidden while the player has not yet said whether it draws its own", async () =>
            narrow(async () => {
                engine.native = null;
                const wrapper = await playing();
                expect(nowPlayingHidden(wrapper)).toBe(true);
            }));

        it("keeps the platform's screen for an error or a video not yet out, which its panel explains", async () =>
            narrow(async () => {
                const wrapper = await playing();
                const shown = engine.handle.showNowPlaying.mock.calls.length;
                engine.state.lifecycle = "error";
                await flushPromises();
                expect(nowPlayingHidden(wrapper)).toBe(true);
                expect(engine.handle.hideNowPlaying).not.toHaveBeenCalled();
                engine.state.lifecycle = "waiting-for-master";
                await flushPromises();
                expect(nowPlayingHidden(wrapper)).toBe(true);
                expect(engine.handle.showNowPlaying.mock.calls.length).toBeGreaterThanOrEqual(
                    shown,
                );
            }));

        it("turns the picture off in place for the sound, and back on for the picture", async () =>
            narrow(async () => {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();

                expect(engine.handle.setVideoOff).toHaveBeenLastCalledWith(true);
                expect(engine.controller.setAngle).not.toHaveBeenCalled();
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].audioMode).toBe(true);

                await find(wrapper, "mediaPlayerVideo").trigger("click");
                await flushPromises();
                expect(engine.handle.setVideoOff).toHaveBeenLastCalledWith(false);
                expect(engine.controller.setAngle).not.toHaveBeenCalled();
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].audioMode).toBe(false);
            }));

        it("runs the sleep timer the screen's menu picks", async () =>
            narrow(async () => {
                await playing();
                engine.emit("nowplayingaction", "sleep", "15");
                expect(engine.controller.setSleepTimer).toHaveBeenLastCalledWith({
                    kind: "minutes",
                    minutes: 15,
                });
                engine.emit("nowplayingaction", "sleep", "chapter");
                expect(engine.controller.setSleepTimer).toHaveBeenLastCalledWith({
                    kind: "chapter",
                });
                engine.emit("nowplayingaction", "sleep", "off");
                expect(engine.controller.setSleepTimer).toHaveBeenLastCalledWith(null);
            }));

        it("tells the screen the running timer and the minutes picked, and when it ends", async () =>
            narrow(async () => {
                await playing();
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].sleep).toBeNull();

                engine.emit("nowplayingaction", "sleep", "15");
                const endsAt = Date.now() + 14.2 * 60_000;
                engine.state.sleepTimer = { kind: "minutes", endsAt };
                await flushPromises();
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].sleep).toEqual({
                    kind: "minutes",
                    endsAt,
                    minutes: 15,
                });

                engine.state.sleepTimer = { kind: "chapter" };
                await flushPromises();
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].sleep).toEqual({
                    kind: "chapter",
                });

                engine.state.sleepTimer = null;
                await flushPromises();
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].sleep).toBeNull();
            }));

        it("opens the next item as sound once the viewer chose sound, with no picture first", async () =>
            narrow(async () => {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();

                openMediaPlayer({ ...mockEnglishContentDto, _id: "another-post" }, "en");
                await flushPromises();
                // The picture's off-switch belongs to the item it was used on; the next one loads as sound.
                expect(engine.handle.setVideoOff).toHaveBeenLastCalledWith(false);
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].audioMode).toBe(true);
            }));

        it("opens the next item with its picture once the viewer chose the picture", async () =>
            narrow(async () => {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();
                await find(wrapper, "mediaPlayerVideo").trigger("click");
                await flushPromises();

                openMediaPlayer({ ...mockEnglishContentDto, _id: "another-post" }, "en");
                await flushPromises();
                expect(engine.handle.showNowPlaying.mock.calls.at(-1)[0].audioMode).toBe(false);
            }));

        it("loads the sound angle where the picture cannot be turned off in place", async () =>
            narrow(async () => {
                engine.native = false;
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();
                expect(engine.controller.setAngle).toHaveBeenCalledWith(AUDIO);
            }));
    });

    describe("drawing the player down", () => {
        const pointer = (y: number) => ({ clientY: y, pointerId: 1 });
        const sectionStyle = (wrapper: VueWrapper) =>
            find(wrapper, "mediaPlayer").attributes("style") ?? "";

        it("slides into the bar when it is let go far enough down", async () => {
            screenWide = false;
            const wrapper = await playing();
            const handle = find(wrapper, "audioFullscreenTop");
            await handle.trigger("pointerdown", pointer(100));
            await handle.trigger("pointermove", pointer(450));
            await handle.trigger("pointerup");

            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");
            expect(find(wrapper, "mediaPlayer").classes()).toContain("translate-y-[110vh]");
        });

        it("is drawn down from the audio and video switch too, once the thumb has moved down", async () => {
            screenWide = false;
            const wrapper = await playing();
            const audio = find(wrapper, "mediaPlayerAudio");
            await audio.trigger("pointerdown", pointer(100));
            // Within a tap's slop the press is still the button's.
            await audio.trigger("pointermove", pointer(108));
            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");

            await audio.trigger("pointermove", pointer(160));
            await audio.trigger("pointermove", pointer(500));
            await audio.trigger("pointerup");
            expect(find(wrapper, "mediaPlayer").classes()).toContain("translate-y-[110vh]");
        });

        it("leaves a tap on the switch to the switch", async () => {
            const wrapper = await playing();
            const audio = find(wrapper, "mediaPlayerAudio");
            await audio.trigger("pointerdown", pointer(100));
            await audio.trigger("pointerup");
            await audio.trigger("click");

            expect(engine.controller.setAngle).toHaveBeenCalledWith(AUDIO);
            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");
            expect(find(wrapper, "mediaPlayer").classes()).not.toContain("translate-y-[110vh]");
        });
    });

    describe("the transport", () => {
        it("shows no spinner over an error", async () => {
            const wrapper = await playing();
            engine.state.playing = false;
            engine.state.duration = 0;
            engine.state.lifecycle = "error";
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerStarting']").exists()).toBe(false);
        });

        it("shows no live label for a recorded video", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerLive']").exists()).toBe(false);
        });

        it("does not scroll as a whole, so nothing dark shows where it would move", async () => {
            const wrapper = await playing();
            const section = find(wrapper, "mediaPlayer").classes();
            expect(section).toContain("overflow-hidden");
            expect(section).not.toContain("overflow-y-auto");
        });

        it("shows no subtitles button when the source has none", async () => {
            const wrapper = await playing();
            engine.state.subtitleTracks = [];
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerSubtitles']").exists()).toBe(false);
        });

        it("offers no language menu for a single track", async () => {
            const wrapper = await playing();
            engine.state.audioTracks = [{ id: "en", lang: "en", label: "English" }];
            await flushPromises();

            expect(wrapper.find("button[aria-label='media_player.language']").exists()).toBe(false);
        });
    });

    describe("over the chrome", () => {
        it("covers the whole screen on a phone, above the page's top bar and the mobile menu", async () => {
            const wrapper = await playing();
            const section = find(wrapper, "mediaPlayer");
            // The menu is z-50 and the page's top bar z-30; modals sit higher still, at z-[100].
            expect(section.classes()).toEqual(
                expect.arrayContaining(["fixed", "inset-0", "z-[60]"]),
            );
            expect(section.attributes("style") ?? "").not.toContain("--media-player-top");
        });

        it("puts the chrome away while it is open on a phone, which takes the status bar with it", async () => {
            await narrow(async () => {
                const { hidden } = useMobileChromeAutoHide();
                hidden.value = false;
                await playing();
                expect(hidden.value).toBe(true);
            });
        });

        it("leaves the chrome be on a wide screen, where the player is a card in the corner", async () => {
            await wide(async () => {
                const { hidden } = useMobileChromeAutoHide();
                hidden.value = false;
                await playing();
                expect(hidden.value).toBe(false);
            });
        });

        it("fills the home indicator's space under the minimised bar", async () => {
            screenWide = false;
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBar").classes()).toEqual(
                expect.arrayContaining([
                    "after:top-full",
                    "after:h-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))]",
                ]),
            );
        });

        it("hands the page back with its bars showing when it is minimised", async () => {
            const { hidden } = useMobileChromeAutoHide();
            await playing();
            // The page behind scrolled while the player covered it.
            hidden.value = true;
            minimiseMediaPlayer();
            await flushPromises();
            expect(hidden.value).toBe(false);
        });

        it("leaves the chrome to hide and show as the page is read when no player is open", async () => {
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = false;
            mediaPlayerItem.value = null;
            await mountPlayer();

            hidden.value = true;
            await flushPromises();
            expect(hidden.value).toBe(true);
        });

        it("leaves it be while the player is minimised", async () => {
            const { hidden } = useMobileChromeAutoHide();
            await playing();
            minimiseMediaPlayer();
            await flushPromises();

            hidden.value = true;
            await flushPromises();
            expect(hidden.value).toBe(true);
        });
    });

    describe("mute and picture in picture", () => {
        it("are not shown where the platform has none", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerMute']").exists()).toBe(false);
            expect(wrapper.find("[data-test='mediaPlayerPictureInPicture']").exists()).toBe(false);
        });

        it("with a mouse, offers the volume on a card over a mute button in the now-playing tools", () =>
            narrow(async () => {
                pointerFine = true;
                const wrapper = await playing();
                const mute = wrapper.find("[data-test='mediaPlayerVolumeMute']");
                expect(mute.exists()).toBe(true);
                expect(wrapper.find("[data-test='mediaPlayerVolume']").exists()).toBe(false);

                await mute.element.parentElement!.dispatchEvent(new Event("mouseenter"));
                await flushPromises();
                expect(wrapper.find("[data-test='mediaPlayerVolume']").exists()).toBe(true);

                await wrapper.find("[data-test='mediaPlayerVolumeUp']").trigger("click");
                expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.6);
                await wrapper.find("[data-test='mediaPlayerVolumeDown']").trigger("click");
                expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.4);
                await wrapper.find("[data-test='mediaPlayerVolumeSlider']").setValue("0.25");
                expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.25);

                await mute.trigger("click");
                expect(engine.handle.setMuted).toHaveBeenLastCalledWith(true);
            }));

        it("leaves the volume to a touch screen's own buttons", () =>
            narrow(async () => {
                const wrapper = await playing();
                expect(wrapper.find("[data-test='mediaPlayerVolumeMute']").exists()).toBe(false);
            }));
    });

    describe("AirPlay", () => {
        it("is not offered until there is a device to send to", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerAirPlay']").exists()).toBe(false);
        });
    });

    describe("the tabs under the picture (chapters, up next)", () => {
        const tabIds = (wrapper: VueWrapper) =>
            wrapper.findAll("[role=tab]").map((tab) => tab.attributes("data-test"));

        it("offers no tab, and has no About, when there is nothing next and no chapters", async () => {
            const wrapper = await playing();
            expect(tabIds(wrapper)).toEqual([]);
            expect(wrapper.find("[role=tablist]").exists()).toBe(false);
        });

        it("has no strip for the chapters: they are a tab", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerChapterStrip']").exists()).toBe(false);
        });

        it("offers only content that has media, and not the content's own other translations", async () => {
            upNextDocs.value = [
                {
                    ...mockEnglishContentDto,
                    _id: "article",
                    parentId: "article-parent",
                    video: undefined,
                    parentMedia: undefined,
                },
                {
                    ...mockEnglishContentDto,
                    _id: "translation",
                    video: "https://cdn.example.com/t.m3u8",
                },
            ];
            const wrapper = await playing();
            expect(tabIds(wrapper)).toEqual([]);
        });
    });

    describe("the page of what plays", () => {
        const withText = () => {
            openMediaPlayer(
                { ...mockEnglishContentDto, text: "<p>The article.</p>", slug: "the-slug" },
                "en",
            );
            return mountPlayer();
        };

        it("has no About: the summary, article and categories are on the page", async () => {
            const wrapper = await withText();
            expect(wrapper.find("[data-test^='mediaPlayerTab-']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);
        });

        it("goes back to the page of what plays from the full player, under the title", async () => {
            screenWide = false;
            currentRoute.value = { name: "home", params: {} };
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerReadArticle").trigger("click");
            expect(routerPush).toHaveBeenCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
        });

        it("only minimises from the full player when its page is already open", async () => {
            screenWide = false;
            currentRoute.value = { name: "content", params: { slug: "the-slug" } };
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerReadArticle").trigger("click");
            expect(routerPush).not.toHaveBeenCalled();
            expect(mediaPlayerView.value).toBe("mini");
            currentRoute.value = { name: "home", params: {} };
        });

        it("is a rounded card while reading a post on a phone with the menu away, and the bar on the menu otherwise", async () => {
            screenWide = false;
            currentRoute.value = { name: "content", params: { slug: "the-slug" } };
            const { hidden } = useMobileChromeAutoHide();
            try {
                openMediaPlayer(mockEnglishContentDto, "en");
                minimiseMediaPlayer();
                const reading = await mountPlayer();
                const bar = () => find(reading, "mediaPlayerBar").classes();
                hidden.value = false;
                await flushPromises();
                expect(bar()).toContain("inset-x-0");
                expect(bar()).not.toContain("rounded-[14px]");

                hidden.value = true;
                await flushPromises();
                expect(bar()).toEqual(expect.arrayContaining(["rounded-[14px]", "inset-x-2"]));
                reading.unmount();

                currentRoute.value = { name: "home", params: {} };
                const browsing = await mountPlayer();
                expect(find(browsing, "mediaPlayerBar").classes()).not.toContain("rounded-[14px]");
            } finally {
                hidden.value = false;
                currentRoute.value = { name: "home", params: {} };
            }
        });

        it("keeps the bar to the picture, the title, play and close", async () => {
            screenWide = false;
            const wrapper = await withText();
            minimiseMediaPlayer();
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerBarRead']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerBarPlayPause").exists()).toBe(true);
            expect(find(wrapper, "mediaPlayerBarClose").exists()).toBe(true);
        });
    });

    describe("on a phone: the now-playing screen", () => {
        beforeEach(() => {
            screenWide = false;
        });
        const screen = (wrapper: VueWrapper) => wrapper.findComponent({ name: "AudioFullscreen" });

        it("shows one frame of the dragged time over the picture while the timeline is dragged, and no strip", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();
            const view = screen(wrapper);
            const roster = () => wrapper.findComponent({ name: "ScrubRoster" });
            view.vm.$emit("scrub", { time: 30, markerX: 100, width: 390, bottom: 200, held: true });
            await flushPromises();
            expect(roster().exists()).toBe(true);

            // The player puts its strip away as the drag starts, then sends the dragged times.
            view.vm.$emit("scrub", null);
            engine.controller!.thumbnailAt.mockClear();
            view.vm.$emit("scrub", { time: 31, markerX: 120, width: 390, bottom: 200 });
            await flushPromises();
            expect(roster().exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerScrubPicture").exists()).toBe(true);
            expect(engine.controller!.thumbnailAt).toHaveBeenCalledWith(31);

            view.vm.$emit("scrub", { time: 60, markerX: 300, width: 390, bottom: 200 });
            await flushPromises();
            expect(roster().exists()).toBe(false);
            expect(engine.controller!.thumbnailAt).toHaveBeenCalledWith(60);

            view.vm.$emit("scrub", null);
            await flushPromises();
            expect(roster().exists()).toBe(false);
            expect(wrapper.find("[data-test='mediaPlayerScrubPicture']").exists()).toBe(false);
        });

        it("drops a strip still up when a drag arrives without the player closing it first", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();
            const view = screen(wrapper);
            view.vm.$emit("scrub", { time: 30, markerX: 100, width: 390, bottom: 200, held: true });
            view.vm.$emit("scrub", { time: 40, markerX: 110, width: 390, bottom: 200 });
            await flushPromises();
            expect(wrapper.findComponent({ name: "ScrubRoster" }).exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerScrubPicture").exists()).toBe(true);

            view.vm.$emit("scrub", null);
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerScrubPicture']").exists()).toBe(false);
        });

        it("keeps the item's picture over the stage until its video has drawn", async () => {
            const wrapper = await playing();
            openMediaPlayer({ ...mockEnglishContentDto, _id: "another-post" }, "en");
            engine.state.lifecycle = "loading";
            engine.state.playing = false;
            await flushPromises();
            expect(find(wrapper, "mediaPlayerStagePoster").exists()).toBe(true);
            engine.state.lifecycle = "ready";
            engine.state.playing = true;
            await flushPromises();
            expect(find(wrapper, "mediaPlayerStagePoster").exists()).toBe(true);
            engine.state.currentTime = 31;
            await flushPromises();
            expect(find(wrapper, "mediaPlayerStagePoster").exists()).toBe(false);
        });

        it("opens from the bar with a pull up, and springs back from a short one", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            const bar = find(wrapper, "mediaPlayerBar");
            await bar.trigger("pointerdown", { pointerId: 1, clientY: 500 });
            await bar.trigger("pointermove", { pointerId: 1, clientY: 495 });
            await bar.trigger("pointerup", { pointerId: 1, clientY: 495 });
            expect(mediaPlayerView.value).toBe("mini");

            await bar.trigger("pointerdown", { pointerId: 1, clientY: 500 });
            await bar.trigger("pointermove", { pointerId: 1, clientY: 470 });
            expect(bar.attributes("style")).toContain("translateY(-");
            await bar.trigger("pointerup", { pointerId: 1, clientY: 470 });
            expect(mediaPlayerView.value).toBe("expanded");
        });

        it("takes the card's place, dark, with the engine playing in its stage", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerNowPlaying").exists()).toBe(true);
            expect(find(wrapper, "mediaPlayerPlayPause").exists()).toBe(false);
            expect(engine.mounts).toBe(1);
            expect(find(wrapper, "audioFullscreenStage").find("*").exists()).toBe(true);

            const props = screen(wrapper).props();
            expect(props.stage).toBe("video");
            expect(props.appearance).toBe("dark");
            expect(props.exitLabel).toBe("media_player.minimise");
            expect(props.stageHole).toBe(false);
            expect(props.title).toBe(mockEnglishContentDto.title);
        });

        it("keeps a playing video going on a tap of the bar, which only seeks", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();

            screen(wrapper).vm.$emit("scrub", { time: 50, markerX: 120, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", { time: 51, markerX: 122, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", null);
            await flushPromises();

            expect(engine.handle.pause).not.toHaveBeenCalled();
            expect(engine.handle.play).not.toHaveBeenCalled();
        });

        it("holds a playing video still while the bar is dragged, and plays on once it is let go, no strip left up", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();

            screen(wrapper).vm.$emit("scrub", { time: 50, markerX: 120, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", { time: 60, markerX: 160, width: 390, bottom: 200 });
            await flushPromises();
            expect(engine.handle.pause).toHaveBeenCalledTimes(1);
            expect(engine.handle.play).not.toHaveBeenCalled();

            screen(wrapper).vm.$emit("scrub", null);
            await flushPromises();
            expect(engine.handle.play).toHaveBeenCalledTimes(1);
            expect(screen(wrapper).find("[data-test='mediaPlayerNowPlayingRoster']").exists()).toBe(
                false,
            );
        });

        it("shows the frames a tap opened and leaves playback and closing to the player", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();
            const roster = () => screen(wrapper).find("[data-test='mediaPlayerNowPlayingRoster']");

            screen(wrapper).vm.$emit("scrub", {
                time: 50,
                markerX: 120,
                width: 390,
                bottom: 200,
                held: true,
            });
            screen(wrapper).vm.$emit("scrub", {
                time: 60,
                markerX: 160,
                width: 390,
                bottom: 200,
                held: true,
            });
            await flushPromises();
            expect(roster().exists()).toBe(true);

            // Pinned, so the frames can be dragged.
            expect(roster().find("[data-test='mediaPlayerRosterClose']").exists()).toBe(true);

            screen(wrapper).vm.$emit("scrub", null);
            await flushPromises();
            expect(roster().exists()).toBe(false);
            expect(engine.handle.pause).not.toHaveBeenCalled();
            expect(engine.handle.play).not.toHaveBeenCalled();
        });

        it("takes one press on Play to pause after a drag: the press does not first resume the video", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();
            screen(wrapper).vm.$emit("scrub", { time: 50, markerX: 120, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", { time: 60, markerX: 160, width: 390, bottom: 200 });
            await flushPromises();
            screen(wrapper).vm.$emit("scrub", null);
            await flushPromises();
            engine.handle.play.mockClear();

            document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
            screen(wrapper).vm.$emit("toggle-play");
            await flushPromises();
            expect(engine.handle.play).not.toHaveBeenCalled();
            expect(engine.handle.pause).toHaveBeenCalledTimes(2);
            expect(screen(wrapper).find("[data-test='mediaPlayerNowPlayingRoster']").exists()).toBe(
                false,
            );
        });

        it("switches to the sound alone on the same engine, which never stops", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().stage).toBe("cover");
            expect(engine.mounts).toBe(1);
            expect(
                find(wrapper, "audioFullscreenTop").find("[data-test='mediaPlayerVideo']").exists(),
            ).toBe(true);
        });

        it("shows the player busy while the source loads, or when playback is stuck, and not once it plays", async () => {
            const wrapper = await playing();
            expect(screen(wrapper).props().busy).toBe(false);

            engine.state.lifecycle = "loading";
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(true);

            engine.state.lifecycle = "ready";
            engine.state.stalled = true;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(true);

            engine.state.stalled = false;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(false);
        });

        it("shows the player busy from a pick until the picked video plays, and for a while at most", async () => {
            const next = {
                ...mockEnglishContentDto,
                _id: "next-1",
                parentId: "next-1-parent",
                title: "The next one",
                video: "https://cdn.example.com/next.m3u8",
            };
            const after = {
                ...next,
                _id: "next-2",
                parentId: "next-2-parent",
                title: "The one after",
            };
            upNextDocs.value = [next, after];
            const wrapper = await playing();
            screen(wrapper).vm.$emit("upnextselect", "next-1");
            await flushPromises();
            expect(mediaPlayerItem.value?.content._id).toBe("next-1");
            // The video before stands paused while the next one is prepared.
            engine.state.playing = false;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(true);

            engine.state.playing = true;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(false);

            vi.useFakeTimers();
            try {
                screen(wrapper).vm.$emit("upnextselect", "next-2");
                await flushPromises();
                expect(screen(wrapper).props().busy).toBe(true);
                vi.advanceTimersByTime(15_000);
                await flushPromises();
                expect(screen(wrapper).props().busy).toBe(false);
            } finally {
                vi.useRealTimers();
            }
        });

        it.each([
            ["the sound alone", true],
            ["the picture", false],
        ])("keeps %s for a video picked from Up Next", async (_mode, audio) => {
            const next = {
                ...mockEnglishContentDto,
                _id: "next-1",
                parentId: "next-1-parent",
                title: "The next one",
                video: "https://cdn.example.com/next.m3u8",
            };
            upNextDocs.value = [next];
            const wrapper = await playing();
            engine.state.activeAngleId = audio ? AUDIO : "angle_0";
            await flushPromises();

            screen(wrapper).vm.$emit("upnextselect", "next-1");
            await flushPromises();

            expect(mediaPlayerItem.value?.content._id).toBe("next-1");
            expect(mediaPlayerItem.value?.audio).toBe(audio);
            expect(engine.props.startAudio).toBe(audio);
        });

        it("lets a video fill the window of a phone's browser turned sideways, with the player's own controls", async () => {
            screenLandscape = true;
            const wrapper = await playing();
            expect(screen(wrapper).props().fill).toBe(true);
            expect(
                wrapper.findComponent({ name: "MediaPlayerWrapper" }).props("windowedControls"),
            ).toBe(true);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().fill).toBe(false);
            expect(
                wrapper.findComponent({ name: "MediaPlayerWrapper" }).props("windowedControls"),
            ).toBe(false);
        });

        it("keeps the now-playing screen upright, and in the packaged app, which turns to its own full screen", async () => {
            const upright = await playing();
            expect(screen(upright).props().fill).toBe(false);

            screenLandscape = true;
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            try {
                const app = await playing();
                expect(screen(app).props().fill).toBe(false);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("turns the sound screen sideways from its button, and the X turns it back", async () => {
            const lockLandscape = vi.fn();
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: {
                    chromeFadeEnabled: false,
                    setStatusBarHidden: vi.fn(),
                    lockLandscape,
                },
            });
            expect(screen(wrapper).props().fullscreenTool).toBe(false);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().fullscreenTool).toBe(true);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(true);
            expect(screen(wrapper).props().fullscreenActive).toBe(true);

            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);
        });

        it("goes to the sound screen's full screen when the phone is turned, as a video does", async () => {
            const lockLandscape = vi.fn();
            const setPagesTurn = vi.fn();
            let turned: ((sideways: boolean) => void) | undefined;
            const onPhoneTurned = vi.fn((listener: (sideways: boolean) => void) => {
                turned = listener;
                return () => (turned = undefined);
            });
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: {
                    chromeFadeEnabled: false,
                    setStatusBarHidden: vi.fn(),
                    setPagesTurn,
                    lockLandscape,
                    onPhoneTurned,
                },
            });
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            // The pages stay upright: the turn is the screen's to take.
            expect(setPagesTurn).not.toHaveBeenCalledWith(true);

            turned!(true);
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(true);
            expect(screen(wrapper).props().fullscreenActive).toBe(true);

            // The X while still on its side: back upright, and no turn counts until the phone is upright.
            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            turned!(true);
            await flushPromises();
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            turned!(false);
            turned!(true);
            await flushPromises();
            expect(screen(wrapper).props().fullscreenActive).toBe(true);

            // Turned back upright: it leaves, as a video's full screen does.
            turned!(false);
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            // Held sideways by its button, it stays so whatever the phone does: only the X lets go.
            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(true);
            turned!(true);
            turned!(false);
            await flushPromises();
            expect(screen(wrapper).props().fullscreenActive).toBe(true);
            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            minimiseMediaPlayer();
            await flushPromises();
            expect(turned).toBeUndefined();
        });

        it("offers no way to turn the sound screen where the platform cannot", async () => {
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: { chromeFadeEnabled: false, setStatusBarHidden: vi.fn() },
            });
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().fullscreenTool).toBe(false);
        });

        it("lets the pages turn with the phone while the sound screen is open, and only then", async () => {
            const setPagesTurn = vi.fn();
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: {
                    chromeFadeEnabled: false,
                    setStatusBarHidden: vi.fn(),
                    setPagesTurn,
                },
            });
            expect(setPagesTurn).toHaveBeenLastCalledWith(false);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(setPagesTurn).toHaveBeenLastCalledWith(true);

            minimiseMediaPlayer();
            await flushPromises();
            expect(setPagesTurn).toHaveBeenLastCalledWith(false);

            openMediaPlayer(mockEnglishContentDto, "en");
            await flushPromises();
            expect(setPagesTurn).toHaveBeenLastCalledWith(true);
            wrappers.splice(wrappers.indexOf(wrapper), 1);
            wrapper.unmount();
            expect(setPagesTurn).toHaveBeenLastCalledWith(false);
        });

        it("leaves a band under the picture for the subtitles the packaged app draws, on every phone", async () => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            try {
                const wrapper = await playing();
                expect(
                    wrapper.findComponent({ name: "MediaPlayerWrapper" }).props("captionBand"),
                ).toBeGreaterThan(0);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("leaves the band in a browser too, so the subtitles under the picture stay off the title", async () => {
            const wrapper = await playing();
            expect(screen(wrapper).props().captionBand).toBe(true);
            // The browser's player draws nothing there itself.
            expect(wrapper.findComponent({ name: "MediaPlayerWrapper" }).props("captionBand")).toBe(
                0,
            );

            engine.state.subtitleTracks = [];
            await flushPromises();
            expect(screen(wrapper).props().captionBand).toBe(false);
        });

        it("leaves its stage clear for a picture the platform draws behind the page", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            expect(screen(wrapper).props().stageHole).toBe(true);
        });

        it("places the picture drawn behind the page again when its stage moves", async () => {
            const wrapper = await playing();
            const resized = vi.fn();
            window.addEventListener("resize", resized);
            try {
                screen(wrapper).vm.$emit("stagechange");
                await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
                await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
                expect(resized).toHaveBeenCalled();
            } finally {
                window.removeEventListener("resize", resized);
            }
        });

        it("minimises from its chevron, and has no close button of its own", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerClose").exists()).toBe(false);
            screen(wrapper).vm.$emit("exit");
            await flushPromises();
            expect(mediaPlayerView.value).toBe("mini");
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(true);
        });

        it("is drawn down from anywhere on it, once the thumb has moved down", async () => {
            const wrapper = await playing();
            const sectionStyle = () => find(wrapper, "mediaPlayer").attributes("style") ?? "";
            const stage = find(wrapper, "audioFullscreenStage");
            await stage.trigger("pointerdown", { clientY: 100, pointerId: 1 });
            // Within a tap's slop the press is still the picture's.
            await stage.trigger("pointermove", { clientY: 106, pointerId: 1 });
            expect(sectionStyle()).not.toContain("--tw-translate-y");
            await stage.trigger("pointermove", { clientY: 160, pointerId: 1 });
            expect(sectionStyle()).toContain("--tw-translate-y: 60px");
        });

        it("is not drawn down by a hover after a press whose release went elsewhere", async () => {
            const wrapper = await playing();
            const sectionStyle = () => find(wrapper, "mediaPlayer").attributes("style") ?? "";
            const stage = find(wrapper, "audioFullscreenStage");
            await stage.trigger("pointerdown", {
                clientY: 100,
                pointerId: 1,
                pointerType: "mouse",
            });
            await stage.trigger("pointermove", {
                clientY: 200,
                pointerId: 1,
                pointerType: "mouse",
                buttons: 0,
            });
            expect(sectionStyle()).not.toContain("--tw-translate-y");

            // Leaving the window drops a press under way too.
            await stage.trigger("pointerdown", {
                clientY: 100,
                pointerId: 2,
                pointerType: "mouse",
            });
            window.dispatchEvent(new Event("blur"));
            await stage.trigger("pointermove", { clientY: 200, pointerId: 2 });
            expect(sectionStyle()).not.toContain("--tw-translate-y");
        });

        it("lets go into the bar from a quarter of the way down", async () => {
            const wrapper = await playing();
            const stage = find(wrapper, "audioFullscreenStage");
            const height = window.innerHeight;
            await stage.trigger("pointerdown", { clientY: 10, pointerId: 1 });
            await stage.trigger("pointermove", { clientY: 10 + height * 0.3, pointerId: 1 });
            await stage.trigger("pointerup", { clientY: 10 + height * 0.3, pointerId: 1 });
            expect(mediaPlayerView.value).toBe("mini");
        });

        it("leaves the timeline's and the open menus' presses alone", async () => {
            const wrapper = await playing();
            const sectionStyle = () => find(wrapper, "mediaPlayer").attributes("style") ?? "";
            screen(wrapper).vm.$emit("covered", true);
            await flushPromises();
            const stage = find(wrapper, "audioFullscreenStage");
            await stage.trigger("pointerdown", { clientY: 100, pointerId: 1 });
            await stage.trigger("pointermove", { clientY: 300, pointerId: 1 });
            expect(sectionStyle()).not.toContain("--tw-translate-y");
        });

        it("hands what is asked to the player", async () => {
            const wrapper = await playing();
            const view = screen(wrapper);
            view.vm.$emit("toggle-play");
            view.vm.$emit("seek", 42, { exact: false });
            view.vm.$emit("subtitle-track", "sub-fr");
            view.vm.$emit("picture-in-picture");
            view.vm.$emit("fullscreen");
            view.vm.$emit("rate", 1.5);
            await flushPromises();
            expect(engine.handle.pause).toHaveBeenCalled();
            expect(engine.handle.seek).toHaveBeenCalledWith(42, { exact: false });
            expect(engine.controller.setSubtitleTrack).toHaveBeenCalledWith("sub-fr");
            expect(engine.handle.startPictureInPicture).toHaveBeenCalled();
            expect(engine.handle.enterFullscreen).toHaveBeenCalled();
            expect(engine.controller.setPlaybackRate).toHaveBeenCalledWith(1.5);
        });

        it("opens with the subtitles on when the viewer last left them on, as the lyrics with sound alone", async () => {
            subtitlePreference.value = { on: true, lang: "fr" };
            const wrapper = await playing();
            engine.handle.subtitleCues = [
                { start: 1, end: 3, text: "Help me, Your Word to obey!" },
            ];
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");
            expect(screen(wrapper).props().lyrics).toEqual(engine.handle.subtitleCues);
        });

        it("keeps the screen on while the lyrics are opened out with sound alone, paused too", async () => {
            const screenWake = { setKeepAwake: vi.fn() };
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({ [ScreenWakeKey]: screenWake });
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            engine.handle.pause();
            screen(wrapper).vm.$emit("lyrics", true);
            await flushPromises();
            expect(screenWake.setKeepAwake).toHaveBeenLastCalledWith(true);
            screen(wrapper).vm.$emit("lyrics", false);
            await flushPromises();
            expect(screenWake.setKeepAwake).toHaveBeenLastCalledWith(false);
        });

        it("leaves the subtitles off for a viewer who left them off", async () => {
            await playing();
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).not.toHaveBeenCalled();
        });

        it("remembers the viewer's own choice, on or off", async () => {
            await playing();
            engine.state.activeSubtitleTrackId = "sub-fr";
            await flushPromises();
            expect(subtitlePreference.value).toEqual({ on: true, lang: "fr" });
            engine.state.activeSubtitleTrackId = null;
            await flushPromises();
            expect(subtitlePreference.value).toEqual({ on: false, lang: "fr" });
        });

        it("puts the subtitles back when a load of the sound alone clears them, and keeps the viewer's choice", async () => {
            subtitlePreference.value = { on: true, lang: "fr" };
            await playing();
            engine.state.activeSubtitleTrackId = "sub-fr";
            await flushPromises();
            engine.controller.setSubtitleTrack.mockClear();
            // A native player starts every load with the subtitles off.
            engine.state.activeAngleId = "__audio__";
            engine.state.activeSubtitleTrackId = null;
            await flushPromises();
            expect(subtitlePreference.value).toEqual({ on: true, lang: "fr" });
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");
        });

        it("leaves the subtitles the viewer chose alone", async () => {
            const wrapper = await playing();
            engine.state.activeSubtitleTrackId = "sub-fr";
            await flushPromises();
            engine.controller.setSubtitleTrack.mockClear();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).not.toHaveBeenCalled();
        });
    });

    describe("keyboard shortcuts", () => {
        const press = (
            key: string,
            init: KeyboardEventInit = {},
            target: EventTarget = document.body,
        ) => {
            const event = new KeyboardEvent("keydown", {
                key,
                bubbles: true,
                cancelable: true,
                ...init,
            });
            target.dispatchEvent(event);
            return event;
        };

        it("jump to a tenth of the way with the digits", async () => {
            await playing();
            press("5");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(60);
            press("0");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(0);
        });

        it("step the volume and mute through the player, unmuting it when the volume goes up", async () => {
            await playing();
            press("ArrowUp");
            expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.6);
            press("ArrowDown");
            expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.4);

            press("m");
            expect(engine.handle.setMuted).toHaveBeenLastCalledWith(true);
            engine.state.muted = true;
            await flushPromises();
            press("ArrowUp");
            expect(engine.handle.setMuted).toHaveBeenLastCalledWith(false);
        });

        it("step through the player's speeds and turn the subtitles on and off", async () => {
            await playing();
            press(">", { shiftKey: true });
            expect(engine.controller.setPlaybackRate).toHaveBeenLastCalledWith(1.25);
            press("<", { shiftKey: true });
            expect(engine.controller.setPlaybackRate).toHaveBeenLastCalledWith(0.75);

            press("c");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");
            engine.state.activeSubtitleTrackId = "sub-fr";
            await flushPromises();
            press("c");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith(null);
        });

        it("open full-screen with F, and the sound screen in audio mode", async () => {
            const wrapper = await playing();
            press("f");
            expect(engine.handle.enterFullscreen).toHaveBeenCalled();

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            press("f");
            await flushPromises();
            expect(find(wrapper, "audioFullscreenStub").exists()).toBe(true);
        });

        it("leave keys to a field being typed in, and to an open modal", async () => {
            await playing();
            const input = document.createElement("input");
            document.body.appendChild(input);
            press(" ", {}, input);
            expect(engine.handle.pause).not.toHaveBeenCalled();
            input.remove();

            const modal = document.createElement("div");
            modal.setAttribute("aria-modal", "true");
            document.body.appendChild(modal);
            press("k");
            expect(engine.handle.pause).not.toHaveBeenCalled();
            modal.remove();
        });

        it("are off in the packaged app", async () => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            try {
                await playing();
                press(" ");
                expect(engine.handle.pause).not.toHaveBeenCalled();
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("stop when the player closes", async () => {
            await playing();
            closeMediaPlayer();
            await flushPromises();
            press(" ");
            expect(engine.handle.pause).not.toHaveBeenCalled();
        });
    });

    describe("minimised on a wide screen", () => {
        it("keeps the bar on a phone, for video too", async () => {
            screenWide = false;
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(true);
            expect(wrapper.find("[data-test='mediaPlayerMiniVideo']").exists()).toBe(false);
        });

        it("always shows the way up on the card, not only on hover", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await flushPromises();
            const classes = find(wrapper, "mediaPlayerBarExpandBadge").classes();
            expect(classes).toContain("w-7");
            expect(classes).not.toContain("lg:w-0");
            expect(
                classes.filter((c) => c.includes("group-hover") || c.includes("group-focus")),
            ).toEqual([]);
        });

        it("draws the way up's box on the bar's own fill, shading it only while pressed or hovered", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await flushPromises();
            const classes = find(wrapper, "mediaPlayerBarExpandBadge").classes();
            expect(classes.filter((c) => /^bg-/.test(c))).toEqual([]);
        });
    });

    describe("video drawn behind the page", () => {
        it("asks the player to draw inline, and does not open full-screen for the switch", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            expect(engine.props.inline).toBe(true);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();
            expect(engine.handle.enterFullscreen).not.toHaveBeenCalled();
        });
    });

    describe("minimised", () => {
        // The bar is a phone's; a wide screen keeps the picture in the corner instead.
        beforeEach(() => {
            screenWide = false;
        });

        it("moves down with the menu when the menu steps aside", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = true;
            await flushPromises();

            expect(find(wrapper, "mediaPlayerBar").classes().join(" ")).toContain(
                "translate-y-[calc(var(--mobile-menu-h",
            );
            hidden.value = false;
        });

        it("shows a video's cover in the bar, with no picture of its own playing there", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();

            const picture = find(wrapper, "mediaPlayerBarPicture");
            expect(picture.find("img").attributes("src")).toBe("/stand-in.jpg");
            expect(find(wrapper, "mediaPlayer").attributes("style") ?? "").not.toContain("top:");
            expect(engine.props.inline).toBe(true);
        });

        it.each([
            ["video", false],
            ["sound", true],
        ])("shows the cover as the same rounded tile for %s", async (_mode, sound) => {
            const wrapper = await playing();
            if (sound) {
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();
            }
            minimiseMediaPlayer();
            await flushPromises();

            const cover = find(wrapper, "mediaPlayerBarCover");
            expect(cover.classes()).toEqual(
                expect.arrayContaining(["h-12", "w-12", "rounded-lg", "object-cover"]),
            );
        });

        it("is the plain dark bar, with nothing blurred, when the post has no ThumbHash", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            const bar = find(wrapper, "mediaPlayerBar");

            expect(bar.classes()).toContain("bg-zinc-900");
            expect(bar.classes().join(" ")).not.toContain("backdrop-blur");
            expect(bar.attributes("style") ?? "").not.toContain("background-color");
        });

        it("wears the post image's ThumbHash over its average colour, darkened for white text", async () => {
            const rgba = new Uint8Array(8 * 8 * 4);
            for (let i = 0; i < 64; i++) rgba.set([240, 220, 200, 255], i * 4);
            const thumbHash = btoa(String.fromCharCode(...rgbaToThumbHash(8, 8, rgba)));
            openMediaPlayer(
                {
                    ...mockEnglishContentDto,
                    parentImageData: {
                        fileCollections: [{ aspectRatio: 1, imageFiles: [], thumbHash }],
                    },
                } as unknown as ContentDto,
                "en",
            );
            const wrapper = await mountPlayer();
            minimiseMediaPlayer();
            await flushPromises();
            const bar = find(wrapper, "mediaPlayerBar");

            expect(bar.classes()).not.toContain("bg-zinc-900");
            const [r, g, b] = (bar.attributes("style") ?? "")
                .match(/rgb\((\d+), (\d+), (\d+)\)/)!
                .slice(1)
                .map(Number);
            // A light picture still gives a bar white text reads on.
            expect(Math.max(r, g, b)).toBeLessThan(140);
            expect(r).toBeGreaterThan(b);
            // Over that colour, the ThumbHash itself, drawn as the wash.
            expect(bar.find("[data-test=thumbHashWash]").exists()).toBe(true);
        });

        it("marks the way up on the picture", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBarPicture").trigger("click");

            expect(mediaPlayerView.value).toBe("expanded");
        });

        it("shows how far the item has played", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();

            expect(find(wrapper, "mediaPlayerBarProgress").attributes("style")).toContain(
                "width: 25%",
            );
        });

        it("shows the spinner in play's place while it loads or is stuck, and play once it plays", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBarPlayPause").exists()).toBe(true);
            expect(wrapper.find("[data-test='mediaPlayerBarBusy']").exists()).toBe(false);

            engine.state.lifecycle = "loading";
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBarBusy").exists()).toBe(true);
            expect(wrapper.find("[data-test='mediaPlayerBarPlayPause']").exists()).toBe(false);

            engine.state.lifecycle = "ready";
            engine.state.stalled = true;
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBarBusy").exists()).toBe(true);

            engine.state.stalled = false;
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerBarBusy']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerBarPlayPause").exists()).toBe(true);
        });

        it("shows no spinner in the bar over an error", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            engine.state.playing = false;
            engine.state.duration = 0;
            engine.state.lifecycle = "error";
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerBarBusy']").exists()).toBe(false);
        });

        it("becomes the bar, keeping the same playback", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();

            expect(mediaPlayerView.value).toBe("mini");
            expect(find(wrapper, "mediaPlayerBar").text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.find(".video-player-stub").exists()).toBe(true);
        });

        it("reopens from the bar", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBar").find("button").trigger("click");

            expect(mediaPlayerView.value).toBe("expanded");
        });

        it("pauses from the bar", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBarPlayPause").trigger("click");

            expect(engine.handle.pause).toHaveBeenCalled();
        });

        it("stops from the bar", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBarClose").trigger("click");

            expect(mediaPlayerItem.value).toBeNull();
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(false);
        });
    });

    describe("the next video in full-screen", () => {
        const doc = (id: string, extra: Record<string, unknown> = {}) => ({
            ...mockEnglishContentDto,
            _id: id,
            parentId: `${id}-parent`,
            slug: `${id}-slug`,
            title: `Title ${id}`,
            video: "https://cdn.example.com/x.m3u8",
            ...extra,
        });

        beforeEach(() => clearSwaps());

        it("offers the player the related videos when there is no next in a series", async () => {
            upNextDocs.value = [doc("rel-1"), doc("rel-2")];
            await playing();
            expect(engine.props.nextUp.map((item: { id: string }) => item.id)).toEqual([
                "rel-1",
                "rel-2",
            ]);
        });

        it("offers nothing when there is nothing to follow", async () => {
            await playing();
            expect(engine.props.nextUp).toEqual([]);
        });

        it("swaps the item, keeps the same player and the full view, and opens the page behind", async () => {
            upNextDocs.value = [doc("rel-1")];
            const wrapper = await playing();
            expect(engine.mounts).toBe(1);

            engine.emit("nextupselect", "rel-1");
            await flushPromises();

            expect(mediaPlayerItem.value?.content._id).toBe("rel-1");
            expect(mediaPlayerView.value).toBe("expanded");
            expect(engine.props.content._id).toBe("rel-1");
            expect(engine.mounts).toBe(1);
            expect(find(wrapper, "mediaPlayer").exists()).toBe(true);
            expect(routerPush).toHaveBeenCalledWith({
                name: "content",
                params: { slug: "rel-1-slug" },
            });
            // The route change that follows must not minimise the player.
            expect(isPlayerSwap("/rel-1-slug")).toBe(true);
        });

        it("ignores a pick that is not the offered video", async () => {
            upNextDocs.value = [doc("rel-1")];
            await playing();
            engine.emit("nextupselect", "other");
            await flushPromises();
            expect(mediaPlayerItem.value?.content._id).toBe(mockEnglishContentDto._id);
            expect(routerPush).not.toHaveBeenCalled();
        });
    });
});
