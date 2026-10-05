import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { userDataSaverEnabled } from "@/globalConfig";
import MediaPlayer from "../MediaPlayer.vue";
import {
    closeMediaPlayer,
    mediaPlayerItem,
    mediaPlayerView,
    openMediaPlayer,
} from "../mediaPlayer";

const AUDIO = "__audio__";

/** The engine `VideoPlayer` hands the media player: a controller, its state, and the handle. */
const engine = vi.hoisted(() => ({
    state: null as any,
    controller: null as any,
    handle: null as any,
    props: null as any,
}));

vi.mock("@luminary-media-converter/player-web", () => ({ AUDIO_ONLY_ANGLE_ID: "__audio__" }));

vi.mock("@/components/content/VideoPlayer.vue", async () => {
    const { defineComponent, h, reactive } = await import("vue");
    return {
        default: defineComponent({
            name: "VideoPlayer",
            props: {
                content: Object,
                language: String,
                startAudio: Boolean,
                autoplay: Boolean,
                fullscreenOnPlay: Boolean,
            },
            setup(props, { expose }) {
                engine.props = props;
                engine.state = reactive({
                    lifecycle: "ready",
                    playing: true,
                    currentTime: 30,
                    duration: 120,
                    playbackRate: 1,
                    isAudioOnly: false,
                    activeAngleId: "angle_0",
                    angles: [
                        { id: "angle_0", name: "Wide", isDefault: true },
                        { id: AUDIO, name: "Audio only", isDefault: false },
                    ],
                    audioTracks: [
                        { id: "en", lang: "en", label: "English" },
                        { id: "fr", lang: "fr", label: "Français" },
                    ],
                    activeAudioTrackId: "en",
                });
                engine.controller = {
                    setAngle: vi.fn(async (id: string) => {
                        engine.state.activeAngleId = id;
                        engine.state.isAudioOnly = id === AUDIO;
                    }),
                    setPlaybackRate: vi.fn(),
                    setAudioTrack: vi.fn(),
                };
                engine.handle = {
                    controller: engine.controller,
                    state: engine.state,
                    play: vi.fn(),
                    pause: vi.fn(),
                    seek: vi.fn(),
                    enterFullscreen: vi.fn(),
                    exitFullscreen: vi.fn(),
                };
                expose({ player: engine.handle });
                return () => h("div", { class: "video-player-stub" });
            },
        }),
    };
});

const wrappers: VueWrapper[] = [];

async function mountPlayer() {
    const wrapper = mount(MediaPlayer, { global: { stubs: { LImage: true } } });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
}

async function playing() {
    openMediaPlayer(mockEnglishContentDto, "en");
    return mountPlayer();
}

const find = (wrapper: VueWrapper, test: string) => wrapper.find(`[data-test='${test}']`);

beforeEach(() => {
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

        it("is not offered when the source has no audio-only angle", async () => {
            const wrapper = await playing();
            engine.state.angles = [{ id: "angle_0", name: "Wide", isDefault: true }];
            await flushPromises();

            expect(find(wrapper, "mediaPlayerAudio").exists()).toBe(false);
        });
    });

    describe("the transport", () => {
        it("pauses and plays", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerPlayPause").trigger("click");
            expect(engine.handle.pause).toHaveBeenCalled();

            engine.state.playing = false;
            await flushPromises();
            await find(wrapper, "mediaPlayerPlayPause").trigger("click");
            expect(engine.handle.play).toHaveBeenCalled();
        });

        it("skips by ten seconds either way", async () => {
            const wrapper = await playing();
            const buttons = wrapper.findAll("button[aria-label^='media_player.skip']");
            await buttons[0]!.trigger("click");
            await buttons[1]!.trigger("click");

            expect(engine.handle.seek).toHaveBeenNthCalledWith(1, 20);
            expect(engine.handle.seek).toHaveBeenNthCalledWith(2, 40);
        });

        it("seeks where the bar is dropped", async () => {
            const wrapper = await playing();
            const bar = find(wrapper, "mediaPlayerSeek");
            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("change");

            expect(engine.handle.seek).toHaveBeenCalledWith(90);
        });

        it("changes speed from the menu", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.speed']").trigger("click");
            const option = wrapper.findAll("li button").find((button) => button.text() === "1.5x");
            await option!.trigger("click");

            expect(engine.controller.setPlaybackRate).toHaveBeenCalledWith(1.5);
        });

        it("changes the audio language from the menu", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.language']").trigger("click");
            const option = wrapper
                .findAll("li button")
                .find((button) => button.text() === "Français");
            await option!.trigger("click");

            expect(engine.controller.setAudioTrack).toHaveBeenCalledWith("fr");
        });

        it("offers no language menu for a single track", async () => {
            const wrapper = await playing();
            engine.state.audioTracks = [{ id: "en", lang: "en", label: "English" }];
            await flushPromises();

            expect(wrapper.find("button[aria-label='media_player.language']").exists()).toBe(false);
        });
    });

    describe("minimised", () => {
        it("becomes the bar, keeping the same playback", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");

            expect(mediaPlayerView.value).toBe("mini");
            expect(find(wrapper, "mediaPlayerBar").text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.find(".video-player-stub").exists()).toBe(true);
        });

        it("reopens from the bar", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBar").find("button").trigger("click");

            expect(mediaPlayerView.value).toBe("expanded");
        });

        it("pauses from the bar", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBarPlayPause").trigger("click");

            expect(engine.handle.pause).toHaveBeenCalled();
        });

        it("stops from the bar", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBarClose").trigger("click");

            expect(mediaPlayerItem.value).toBeNull();
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(false);
        });
    });
});
