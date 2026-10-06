import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { userDataSaverEnabled } from "@/globalConfig";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
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
    inlineActive: false,
}));

vi.mock("@luminary-media-converter/player-web", () => ({ AUDIO_ONLY_ANGLE_ID: "__audio__" }));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({ useRouter: () => ({ push: routerPush }) }));

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
                inline: Boolean,
            },
            setup(props, { expose }) {
                engine.props = props;
                engine.state = reactive({
                    lifecycle: "ready",
                    playing: true,
                    currentTime: 30,
                    duration: 120,
                    bufferedEnd: 60,
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
                    subtitleTracks: [
                        { id: "sub-fr", lang: "fr", label: "Français", source: "master" },
                    ],
                    activeSubtitleTrackId: null,
                });
                engine.controller = {
                    setAngle: vi.fn(async (id: string) => {
                        engine.state.activeAngleId = id;
                        engine.state.isAudioOnly = id === AUDIO;
                    }),
                    setPlaybackRate: vi.fn(),
                    setAudioTrack: vi.fn(),
                    setSubtitleTrack: vi.fn(),
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
                expose({
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
    engine.inlineActive = false;
    document.documentElement.classList.remove("lmc-inline-video");
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

        it("shows how much is loaded under what has played", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerLoaded").attributes("style")).toContain("width: 50%");
        });

        it("opens full-screen from the picture's corner", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerFullscreen").trigger("click");
            expect(engine.handle.enterFullscreen).toHaveBeenCalled();
        });

        it("offers no full-screen while there is no picture", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(find(wrapper, "mediaPlayerFullscreen").exists()).toBe(false);
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

        it("turns subtitles on and off from the menu", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerSubtitles").trigger("click");
            await wrapper
                .findAll("li button")
                .find((button) => button.text() === "Français")!
                .trigger("click");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");

            await find(wrapper, "mediaPlayerSubtitles").trigger("click");
            await wrapper.findAll("li button")[0]!.trigger("click");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith(null);
        });

        it("offers no subtitles the source does not have", async () => {
            const wrapper = await playing();
            engine.state.subtitleTracks = [];
            await flushPromises();
            expect(find(wrapper, "mediaPlayerSubtitles").attributes("disabled")).toBeDefined();
        });

        it("offers no language menu for a single track", async () => {
            const wrapper = await playing();
            engine.state.audioTracks = [{ id: "en", lang: "en", label: "English" }];
            await flushPromises();

            expect(wrapper.find("button[aria-label='media_player.language']").exists()).toBe(false);
        });
    });

    describe("between the chrome", () => {
        afterEach(() => document.querySelector("[data-top-bar]")?.remove());

        it("starts below the open page's top bar", async () => {
            const topBar = document.createElement("div");
            topBar.setAttribute("data-top-bar", "");
            topBar.getBoundingClientRect = () => ({ height: 90 }) as DOMRect;
            document.body.appendChild(topBar);

            const wrapper = await playing();

            expect(find(wrapper, "mediaPlayer").attributes("style")).toContain(
                "--media-player-top: 90px",
            );
        });

        it("starts at the top where the page has no top bar", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayer").attributes("style")).toContain(
                "--media-player-top: 0px",
            );
        });

        it("brings the chrome back that scrolling had put away", async () => {
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = true;
            await playing();
            expect(hidden.value).toBe(false);
        });
    });

    describe("about, and the page of what plays", () => {
        const withText = () => {
            openMediaPlayer(
                { ...mockEnglishContentDto, text: "<p>The article.</p>", slug: "the-slug" },
                "en",
            );
            return mountPlayer();
        };

        it("opens the article under the player, and closes it", async () => {
            const wrapper = await withText();
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);

            await find(wrapper, "mediaPlayerAboutToggle").trigger("click");
            expect(find(wrapper, "mediaPlayerAbout").text()).toContain("The article.");
            expect(wrapper.find(".video-player-stub").exists()).toBe(true);

            await find(wrapper, "mediaPlayerAboutClose").trigger("click");
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);
        });

        it("says there is nothing to read when the content has neither article nor summary, and still leads to the page", async () => {
            openMediaPlayer(
                { ...mockEnglishContentDto, text: undefined, summary: undefined, slug: "the-slug" },
                "en",
            );
            const wrapper = await mountPlayer();
            await find(wrapper, "mediaPlayerAboutToggle").trigger("click");

            expect(find(wrapper, "mediaPlayerAboutEmpty").exists()).toBe(true);
            await find(wrapper, "mediaPlayerRead").trigger("click");
            expect(routerPush).toHaveBeenLastCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
        });

        it("closes with the player: minimised, or another item", async () => {
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerAboutToggle").trigger("click");
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);
        });

        it("goes to the page of what plays, from the sheet and from the bar", async () => {
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerAboutToggle").trigger("click");
            await find(wrapper, "mediaPlayerRead").trigger("click");
            expect(routerPush).toHaveBeenLastCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });

            routerPush.mockClear();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBarRead").trigger("click");
            expect(routerPush).toHaveBeenCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
        });
    });

    describe("video drawn behind the page", () => {
        const hole = () => document.documentElement.classList.contains("lmc-inline-video");

        it("leaves the picture area transparent and the page behind it hidden", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            await flushPromises();

            expect(hole()).toBe(true);
            expect(wrapper.find(".aspect-video.bg-transparent").exists()).toBe(true);
        });

        it("keeps the picture black and the page as it was where the platform cannot", async () => {
            const wrapper = await playing();

            expect(hole()).toBe(false);
            expect(wrapper.find(".aspect-video.bg-black").exists()).toBe(true);
        });

        it("gives the page back in audio mode, minimised and closed", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            await flushPromises();
            expect(hole()).toBe(true);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(hole()).toBe(false);

            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();
            expect(hole()).toBe(true);

            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            expect(hole()).toBe(false);
        });

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
        it("moves down with the menu when the menu steps aside", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = true;
            await flushPromises();

            expect(find(wrapper, "mediaPlayerBar").classes().join(" ")).toContain(
                "translate-y-[calc(var(--mobile-menu-h",
            );
            hidden.value = false;
        });

        it("shows how far the item has played", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");

            expect(find(wrapper, "mediaPlayerBarProgress").attributes("style")).toContain(
                "width: 25%",
            );
        });

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
