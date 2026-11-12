import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import AudioFullscreen from "../components/AudioFullscreen.vue";
import NowPlayingGlyph from "../components/NowPlayingGlyph.vue";
import NowPlayingLyrics from "../components/NowPlayingLyrics.vue";
import { DEFAULT_MESSAGES } from "../messages";
import {
    TOOL_CELL_MAX_PX,
    autoBitrateLabel,
    bitrateBadge,
    toolGlyphPx,
    toolLabelPx,
} from "../ui/audioFullscreen";
import { LYRIC_ARROW_LINES, lyricArrow } from "../ui/lyrics";
import { autoplayOff, autoplayOn, captionsOn, moonFilled } from "../ui/nowPlayingGlyphs";

const lyrics = Array.from({ length: 30 }, (_, i) => ({
    start: i * 4,
    end: i * 4 + 4,
    text: `Line ${i + 1}`,
}));

function mountScreen(props: Record<string, unknown> = {}) {
    return mount(AudioFullscreen, {
        props: {
            title: "Breakfast discussion",
            subtitle: "8 November 2026",
            eyebrow: "Talks",
            artwork: { src: "https://cdn.example.com/cover.jpg" },
            appearance: "dark",
            chapters: [],
            currentTime: 0,
            duration: 480,
            bufferedEnd: 0,
            playing: false,
            chapterIndex: -1,
            playbackRate: 1,
            audioTracks: [{ id: "en", label: "English" }],
            activeAudioTrackId: "en",
            sleepTimer: null,
            hasBrowse: true,
            skipBackSeconds: 10,
            skipForwardSeconds: 10,
            chapterMask: "",
            messages: DEFAULT_MESSAGES,
            ...props,
        },
        global: {
            config: {
                compilerOptions: { isCustomElement: (tag: string) => tag.startsWith("media-") },
            },
        },
        attachTo: document.body,
    });
}
const find = (wrapper: { find: (s: string) => any }, test: string) =>
    wrapper.find(`[data-test='${test}']`);
const label = (wrapper: ReturnType<typeof mountScreen>, test: string) =>
    find(wrapper, test).find(".lmpl-afs-toollabel").text();

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("tools row sizing", () => {
    it("keeps 11px while the widest name fits, shrinks it so it does, never under 9px", () => {
        expect(toolLabelPx(40, 64, 4)).toBe(11);
        expect(toolLabelPx(60, 64, 4)).toBe(11);
        expect(toolLabelPx(66, 64, 4)).toBeCloseTo(10, 5);
        expect(toolLabelPx(200, 64, 4)).toBe(9);
        expect(toolLabelPx(0, 64, 4)).toBe(11);
    });

    it("shrinks the glyph only in a cell narrower than a full one", () => {
        expect(TOOL_CELL_MAX_PX).toBe(64);
        expect(toolGlyphPx(64)).toBe(24);
        expect(toolGlyphPx(52)).toBe(24);
        expect(toolGlyphPx(39)).toBe(18);
    });
});

describe("sound's quality badge", () => {
    it("says the held bitrate in kilobits, as the native screen does", () => {
        expect(bitrateBadge(64_000)).toBe("64k");
        expect(bitrateBadge(127_600)).toBe("128k");
        expect(bitrateBadge(0)).toBeUndefined();
        expect(bitrateBadge(undefined)).toBeUndefined();
    });

    const qualities = [
        { id: "b256000", label: "256 kbps", bandwidth: 256_000 },
        { id: "b128000", label: "128 kbps", bandwidth: 128_000 },
        { id: "b64000", label: "64 kbps", bandwidth: 64_000 },
    ];

    it("shows the held bitrate over the quality tool", async () => {
        const wrapper = mountScreen({
            qualities,
            activeQualityId: "b64000",
            playingBandwidth: 64_000,
        });
        expect(find(wrapper, "afsQualityBadge").text()).toBe("64k");
    });

    it("on Auto shows the bitrate playing, following it up and down, and nothing before it is known", async () => {
        const wrapper = mountScreen({ qualities, activeQualityId: "auto" });
        expect(find(wrapper, "afsQualityBadge").exists()).toBe(false);
        await wrapper.setProps({ playingBandwidth: 64_000 });
        expect(find(wrapper, "afsQualityBadge").text()).toBe("64k");
        await wrapper.setProps({ playingBandwidth: 256_000 });
        expect(find(wrapper, "afsQualityBadge").text()).toBe("256k");
    });

    it("says in the Auto row which bitrate Auto plays", async () => {
        const wrapper = mountScreen({
            qualities,
            activeQualityId: "auto",
            playingBandwidth: 128_000,
            dataSaver: "off",
        });
        await find(wrapper, "afsQuality").trigger("click");
        expect(find(wrapper, "afsQualityAuto").text()).toBe("Auto (128 kbps)");
        await wrapper.setProps({ playingBandwidth: undefined });
        expect(find(wrapper, "afsQualityAuto").text()).toBe("Auto");
    });

    it("words the Auto row as the menu's own row, or in kbps for a rate it does not list", () => {
        expect(autoBitrateLabel("Auto", 128_000, qualities)).toBe("Auto (128 kbps)");
        expect(autoBitrateLabel("Auto", 96_400, qualities)).toBe("Auto (96 kbps)");
        expect(autoBitrateLabel("Auto", undefined, qualities)).toBe("Auto");
        expect(autoBitrateLabel("Auto", 0, qualities)).toBe("Auto");
    });
});

describe("lyrics arrow", () => {
    const view = { viewTop: 1000, viewHeight: 300, lineHeight: 20 };
    it("points up once the lit line is three lines or more above what is in view", () => {
        expect(LYRIC_ARROW_LINES).toBe(3);
        expect(lyricArrow({ ...view, rowTop: 900, rowBottom: 939 })).toBe("up");
        expect(lyricArrow({ ...view, rowTop: 920, rowBottom: 945 })).toBeNull();
    });
    it("points down once it is three lines or more below, and shows nothing near the view", () => {
        expect(lyricArrow({ ...view, rowTop: 1361, rowBottom: 1400 })).toBe("down");
        expect(lyricArrow({ ...view, rowTop: 1350, rowBottom: 1380 })).toBeNull();
        expect(lyricArrow({ ...view, rowTop: 1100, rowBottom: 1130 })).toBeNull();
    });
});

describe("NowPlayingGlyph", () => {
    it("draws outlines and fills, dimmed layers and even-odd holes as given", () => {
        const off = mount(NowPlayingGlyph, { props: { glyph: autoplayOff } });
        const paths = off.findAll("path");
        expect(paths).toHaveLength(4);
        expect(paths.filter((path) => path.attributes("opacity") === "0.55")).toHaveLength(3);
        expect(paths[3]!.attributes("stroke")).toBe("currentColor");
        expect(paths[2]!.attributes("fill")).toBe("currentColor");
        expect(off.find("svg").attributes("viewBox")).toBe("0 0 24 24");

        expect(
            mount(NowPlayingGlyph, { props: { glyph: autoplayOn } }).findAll("path"),
        ).toHaveLength(3);
        const cc = mount(NowPlayingGlyph, { props: { glyph: captionsOn } });
        expect(cc.find("svg").attributes("viewBox")).toBe("0 0 18 18");
        expect(cc.find("path").attributes("fill-rule")).toBe("evenodd");
        expect(
            mount(NowPlayingGlyph, { props: { glyph: moonFilled } }).findAll("path"),
        ).toHaveLength(2);
    });
});

describe("AudioFullscreen, as the native screen draws it", () => {
    it("names every tool under its glyph, the short names in the row and the long ones for a screen reader", () => {
        const wrapper = mountScreen({
            audioTracks: [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ],
            subtitleTracks: [{ id: "en", label: "English" }],
            activeSubtitleTrackId: null,
            lyrics,
        });
        expect(label(wrapper, "afsSpeed")).toBe("Speed");
        expect(find(wrapper, "afsSpeed").attributes("aria-label")).toBe(
            DEFAULT_MESSAGES.speedLabel,
        );
        expect(label(wrapper, "afsSleep")).toBe("Sleep");
        expect(find(wrapper, "afsSleep").attributes("aria-label")).toBe("Sleep timer");
        expect(label(wrapper, "afsLanguage")).toBe("Audio");
        expect(label(wrapper, "afsLyricsLanguage")).toBe("Lyrics");
        expect(label(wrapper, "afsBrowse")).toBe("More");
        expect(find(wrapper, "afsBrowse").attributes("aria-label")).toBe(DEFAULT_MESSAGES.browse);
    });

    it("calls the browse tool Chapters when the item has chapters", () => {
        const wrapper = mountScreen({
            chapters: [
                { startTime: 0, endTime: 60, title: "One" },
                { startTime: 60, endTime: 480, title: "Two" },
            ],
            chapterIndex: 0,
        });
        expect(label(wrapper, "afsBrowse")).toBe("Chapters");
    });

    it("names the subtitles tool Subtitles with a picture", () => {
        const wrapper = mountScreen({
            stage: "video",
            subtitleTracks: [{ id: "en", label: "English" }],
            activeSubtitleTrackId: "en",
        });
        expect(label(wrapper, "afsSubtitles")).toBe("Subtitles");
    });

    it("fills the glyph of a tool that is on, with no dot under it", async () => {
        const wrapper = mountScreen({ subtitleTracks: [{ id: "en", label: "English" }], lyrics });
        const sleepGlyph = () => find(wrapper, "afsSleep").find("svg").attributes("data-glyph");
        expect(sleepGlyph()).toBe("moon");
        expect(find(wrapper, "afsSleep").classes()).not.toContain("lmpl-afs-on");
        await wrapper.setProps({ sleepTimer: { kind: "minutes", endsAt: Date.now() + 60_000 } });
        expect(sleepGlyph()).toBe("moonFilled");
        expect(find(wrapper, "afsSleep").classes()).toContain("lmpl-afs-on");

        const ccGlyph = () =>
            find(wrapper, "afsLyricsLanguage").find("svg").attributes("data-glyph");
        expect(ccGlyph()).toBe("captionsOff");
        await wrapper.setProps({ activeSubtitleTrackId: "en" });
        expect(ccGlyph()).toBe("captionsOn");
    });

    it("keeps the badge's room over every glyph, shown or not, so the glyphs stand level", async () => {
        const wrapper = mountScreen();
        const cells = wrapper.findAll(".lmpl-afs-toolcell");
        expect(cells.length).toBeGreaterThan(2);
        for (const cell of cells) {
            expect(cell.element.firstElementChild?.classList.contains("lmpl-afs-toolbadge")).toBe(
                true,
            );
        }
        expect(find(wrapper, "afsSpeed").find(".lmpl-afs-badge").exists()).toBe(false);
        await wrapper.setProps({ playbackRate: 1.5 });
        expect(find(wrapper, "afsSpeed").find(".lmpl-afs-toolbadge .lmpl-afs-badge").text()).toBe(
            "1.5×",
        );
    });

    it("fits the row's names to the narrowest cell, all at one size", async () => {
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
            this: HTMLElement,
        ) {
            return this.classList.contains("lmpl-afs-tools") ? 200 : 0;
        });
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
            this: HTMLElement,
        ) {
            // The measuring span: as wide as its text, 7px a letter at 11px.
            const width = this.classList.contains("lmpl-afs-toolmeasure")
                ? (this.textContent?.length ?? 0) * 7
                : 0;
            return {
                width,
                height: 0,
                top: 0,
                left: 0,
                right: width,
                bottom: 0,
                x: 0,
                y: 0,
                toJSON() {},
            };
        });
        const wrapper = mountScreen({
            audioTracks: [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ],
        });
        await nextTick();
        const row = wrapper.find(".lmpl-afs-tools").element as HTMLElement;
        // Speed, Sleep, Audio, More: four cells of 50px; "Speed"/"Sleep"/"Audio" are 35px, fits 46 → stays 11.
        expect(row.style.getPropertyValue("--lmpl-tool-label")).toBe("11px");
        expect(Number.parseFloat(row.style.getPropertyValue("--lmpl-tool-glyph"))).toBeCloseTo(
            (24 * 50) / 52,
            5,
        );
    });

    it("puts the autoplay switch's own glyph in, dimmed and struck through when off", async () => {
        const wrapper = mountScreen({ autoplay: true });
        const button = find(wrapper, "afsAutoplay");
        expect(button.attributes("role")).toBe("switch");
        expect(button.findAll("path")).toHaveLength(3);
        await wrapper.setProps({ autoplay: false });
        expect(find(wrapper, "afsAutoplay").findAll("path")).toHaveLength(4);
        expect(find(wrapper, "afsAutoplay").attributes("aria-checked")).toBe("false");
    });

    it("keeps the cover a plain square until its picture is in, then shows it", async () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsCover").classes()).toContain("lmpl-afs-cover-loading");
        await find(wrapper, "afsCover").trigger("load");
        expect(find(wrapper, "afsCover").classes()).not.toContain("lmpl-afs-cover-loading");
        // A new item's picture waits again.
        await wrapper.setProps({ artwork: { src: "https://cdn.example.com/other.jpg" } });
        expect(find(wrapper, "afsCover").classes()).toContain("lmpl-afs-cover-loading");
    });

    it("opens the lyrics from a tap on the words on the cover, with no line left under the cover", async () => {
        const wrapper = mountScreen({
            subtitleTracks: [{ id: "en", label: "English" }],
            activeSubtitleTrackId: "en",
            lyrics,
            currentTime: 5,
        });
        expect(find(wrapper, "afsCue").text()).toBe("Line 2");
        expect(wrapper.find(".lmpl-afs-cueline").exists()).toBe(false);
        await find(wrapper, "afsCue").trigger("click");
        expect(find(wrapper, "afsLyrics").exists()).toBe(true);
        expect(wrapper.emitted("lyrics")?.at(-1)).toEqual([true]);
        await find(wrapper, "afsLyricsExpand").trigger("click");
        expect(find(wrapper, "afsLyrics").exists()).toBe(false);
        expect(find(wrapper, "afsCue").exists()).toBe(true);
    });

    it("shows a plain cover with subtitles off: no shade, no words, no button", () => {
        const wrapper = mountScreen({
            subtitleTracks: [{ id: "en", label: "English" }],
            activeSubtitleTrackId: null,
            lyrics,
        });
        expect(find(wrapper, "afsCoverCue").exists()).toBe(false);
        expect(find(wrapper, "afsLyricsExpand").exists()).toBe(false);
    });
});

describe("NowPlayingLyrics: the way back instead of a timer", () => {
    /** A list 300px tall whose rows are 40px apart, one line of text (20px) each. */
    function mountLyrics(currentTime = 0) {
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
        vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(30 * 40 + 300);
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);
        vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (
            this: HTMLElement,
        ) {
            const rows = Array.from(this.parentElement?.parentElement?.children ?? []);
            const index = rows.indexOf(this.parentElement as Element);
            return 150 + Math.max(0, index) * 40;
        });
        const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
            this.scrollTop = options.top ?? 0;
            this.dispatchEvent(new Event("scroll"));
        });
        Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
        const wrapper = mount(NowPlayingLyrics, {
            props: { lines: lyrics, currentTime, label: "Lyrics", backLabel: "Back to the line" },
            attachTo: document.body,
        });
        return { wrapper, scrollTo };
    }
    afterEach(() => {
        // @ts-expect-error put back as jsdom has it: without one
        delete Element.prototype.scrollTo;
    });

    it("follows the lit line until the viewer scrolls, then stays put", async () => {
        const { wrapper, scrollTo } = mountLyrics(0);
        await nextTick();
        await wrapper.setProps({ currentTime: 8 });
        await nextTick();
        expect(scrollTo).toHaveBeenCalled();
        const calls = scrollTo.mock.calls.length;

        const list = find(wrapper, "afsLyrics");
        await list.trigger("touchstart");
        (list.element as HTMLElement).scrollTop = 900;
        await list.trigger("scroll");
        await list.trigger("touchend");
        await wrapper.setProps({ currentTime: 12 });
        await nextTick();
        expect(scrollTo.mock.calls.length).toBe(calls);
    });

    it("counts a fling after the finger lifted as the viewer's scroll", async () => {
        const { wrapper, scrollTo } = mountLyrics(0);
        await nextTick();
        const list = find(wrapper, "afsLyrics");
        await list.trigger("pointerdown");
        await list.trigger("pointerup");
        (list.element as HTMLElement).scrollTop = 700;
        await list.trigger("scroll");
        const calls = scrollTo.mock.calls.length;
        await wrapper.setProps({ currentTime: 20 });
        await nextTick();
        expect(scrollTo.mock.calls.length).toBe(calls);
    });

    it("offers an arrow toward the lit line once it is well out of view, which brings it back", async () => {
        const { wrapper, scrollTo } = mountLyrics(0);
        await nextTick();
        expect(find(wrapper, "afsLyricsBack").exists()).toBe(false);
        const list = find(wrapper, "afsLyrics");
        await list.trigger("wheel");
        // Lit line 1 sits at 150..190; scrolled to 400 it is far above the view.
        (list.element as HTMLElement).scrollTop = 400;
        await list.trigger("scroll");
        const back = find(wrapper, "afsLyricsBack");
        expect(back.exists()).toBe(true);
        expect(back.attributes("data-arrow")).toBe("up");
        expect(back.attributes("aria-label")).toBe("Back to the line");

        await back.trigger("click");
        expect(find(wrapper, "afsLyricsBack").exists()).toBe(false);
        expect(scrollTo.mock.calls.at(-1)?.[0]).toMatchObject({ top: 20 });
        // Following again: the next line is followed.
        const calls = scrollTo.mock.calls.length;
        await wrapper.setProps({ currentTime: 8 });
        await nextTick();
        expect(scrollTo.mock.calls.length).toBeGreaterThan(calls);
    });

    it("points down when the lit line has run on below what the viewer reads", async () => {
        const { wrapper } = mountLyrics(0);
        await nextTick();
        const list = find(wrapper, "afsLyrics");
        await list.trigger("wheel");
        (list.element as HTMLElement).scrollTop = 0;
        await list.trigger("scroll");
        await wrapper.setProps({ currentTime: 80 });
        await nextTick();
        await nextTick();
        expect(find(wrapper, "afsLyricsBack").attributes("data-arrow")).toBe("down");
    });

    it("follows at once from a tap on a line, and seeks there", async () => {
        const { wrapper } = mountLyrics(0);
        await nextTick();
        const list = find(wrapper, "afsLyrics");
        await list.trigger("wheel");
        (list.element as HTMLElement).scrollTop = 600;
        await list.trigger("scroll");
        await list.findAll("[data-lyric]")[12]!.trigger("click");
        expect(wrapper.emitted("seek")).toEqual([[48]]);
        expect(find(wrapper, "afsLyricsBack").exists()).toBe(false);
    });
});
