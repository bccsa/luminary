import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AudioFullscreen from "../components/AudioFullscreen.vue";
import { DEFAULT_MESSAGES } from "../messages";

const chapters = Array.from({ length: 8 }, (_, i) => ({
    startTime: i * 60,
    endTime: i * 60 + 60,
    title: `Chapter ${i + 1}`,
}));

function mountScreen(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
    return mount(AudioFullscreen, {
        props: {
            title: "Why we get thirsty",
            subtitle: "Pastor Daniel",
            eyebrow: "Sunday messages",
            artwork: { src: "https://cdn.example.com/cover.jpg" },
            appearance: "dark",
            chapters,
            currentTime: 150,
            duration: 480,
            bufferedEnd: 200,
            playing: false,
            chapterIndex: 2,
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
        slots,
        attachTo: document.body,
    });
}
const find = (wrapper: ReturnType<typeof mountScreen>, test: string) =>
    wrapper.find(`[data-test='${test}']`);

describe("AudioFullscreen — what it shows", () => {
    it("names what is playing: the title, who it is by, and the series", () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsTitle").text()).toBe("Why we get thirsty");
        expect(wrapper.text()).toContain("Pastor Daniel");
        expect(wrapper.text()).toContain("Sunday messages");
    });

    it("shows the fallback in place of a cover that does not load, and the placeholder when there is none", async () => {
        const wrapper = mountScreen({
            artwork: { src: "https://cdn.example.com/broken.jpg", fallback: "/fallback.jpg" },
        });
        await find(wrapper, "afsCover").trigger("error");
        expect(find(wrapper, "afsCover").attributes("src")).toBe("/fallback.jpg");

        const bare = mountScreen({ artwork: { src: "https://cdn.example.com/broken.jpg" } });
        await find(bare, "afsCover").trigger("error");
        expect(find(bare, "afsCover").exists()).toBe(false);
        expect(bare.find(".lmpl-afs-cover-empty").exists()).toBe(true);
    });

    it("leads with the cover, and with a placeholder when there is none", () => {
        expect(find(mountScreen(), "afsCover").attributes("src")).toBe(
            "https://cdn.example.com/cover.jpg",
        );
        const bare = mountScreen({ artwork: null });
        expect(find(bare, "afsCover").exists()).toBe(false);
        expect(bare.find(".lmpl-afs-cover-empty").exists()).toBe(true);
    });

    it("names the chapter the playhead is in, among the others, under what plays", () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsChapterChip").text()).toBe("Chapter 3 of 8 · Chapter 3");
        expect(
            find(mountScreen({ chapters: [], chapterIndex: -1 }), "afsChapterChip").exists(),
        ).toBe(false);
    });

    it("has no chapters or up next button without either", () => {
        const wrapper = mountScreen({ chapters: [], chapterIndex: -1, hasBrowse: false });
        expect(find(wrapper, "afsBrowse").exists()).toBe(false);
    });

    it("opens the chapters from their own button, as rows like up next, marking the playing one", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        const rows = wrapper.findAll(".lmpl-chapter");
        expect(rows).toHaveLength(chapters.length);
        expect(rows[0]!.find(".lmpl-upnext-title").text()).toBe("Chapter 1");
        expect(wrapper.find(".lmpl-chapter[aria-current=true] .lmpl-upnext-title").text()).toBe(
            "Chapter 3",
        );
    });

    it("wears the cover as a colour over the whole screen, in light and in dark", () => {
        const light = mountScreen({ appearance: "light" });
        expect(light.find(".lmpl-afs-wash").exists()).toBe(true);
        expect(light.classes()).toContain("lmpl-afs-light");
        const dark = mountScreen({ appearance: "dark" });
        expect(dark.find(".lmpl-afs-wash").exists()).toBe(true);
        expect(dark.classes()).not.toContain("lmpl-afs-light");
    });

    it("offers the language menu only when there is more than one language", () => {
        expect(find(mountScreen(), "afsLanguage").exists()).toBe(false);
        const two = mountScreen({
            audioTracks: [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ],
        });
        expect(find(two, "afsLanguage").exists()).toBe(true);
    });

    it("has no skip button when skipping is switched off", () => {
        const wrapper = mountScreen({ skipBackSeconds: 0, skipForwardSeconds: 0 });
        expect(find(wrapper, "afsSkipBack").exists()).toBe(false);
        expect(find(wrapper, "afsSkipForward").exists()).toBe(false);
    });

    it("has no way to the chapters panel when there is nothing to browse", () => {
        const wrapper = mountScreen({ hasBrowse: false });
        expect(find(wrapper, "afsBrowse").exists()).toBe(false);
    });
});

describe("AudioFullscreen — the transport", () => {
    it("reads every time in hours once the video is an hour long, and keeps the labels the same width", () => {
        // Each label switching shape on its own as it crossed an hour moved the bar between them.
        const early = mountScreen({ currentTime: 2423, duration: 6150 });
        expect(find(early, "afsElapsed").text()).toBe("0:40:23");
        expect(find(early, "afsRemaining").text()).toBe("-1:02:07");

        const late = mountScreen({ currentTime: 3700, duration: 6150 });
        expect(find(late, "afsElapsed").text()).toBe("1:01:40");
        expect(find(late, "afsRemaining").text()).toBe("-0:40:50");

        const width = (wrapper: ReturnType<typeof mountScreen>, id: string) =>
            find(wrapper, id).attributes("style");
        expect(width(early, "afsElapsed")).toBe(width(late, "afsElapsed"));
        expect(width(early, "afsElapsed")).toBe(width(early, "afsRemaining"));
    });

    it("shows the time played and left, and the fill of the bar", () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsElapsed").text()).toBe("2:30");
        expect(find(wrapper, "afsRemaining").text()).toBe("-5:30");
        expect(find(wrapper, "afsBar").attributes("aria-valuenow")).toBe("150");
        expect(wrapper.find(".lmpl-afs-bar-fill").attributes("style")).toContain("31.25%");
    });

    it("asks to play and to pause from the one button", async () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsPlay").attributes("aria-label")).toBe("Play");
        await find(wrapper, "afsPlay").trigger("click");
        expect(wrapper.emitted("toggle-play")).toHaveLength(1);
        await wrapper.setProps({ playing: true });
        expect(find(wrapper, "afsPlay").attributes("aria-label")).toBe("Pause");
    });

    it("skips back and forward from where the bar shows, within the length, so presses in a row add up", async () => {
        const wrapper = mountScreen({ currentTime: 5 });
        await find(wrapper, "afsSkipBack").trigger("click");
        await find(wrapper, "afsSkipForward").trigger("click");
        await find(wrapper, "afsSkipForward").trigger("click");
        expect(wrapper.emitted("seek")).toEqual([[0], [10], [20]]);
    });

    it("seeks with the arrow keys, five seconds at a time", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsBar").trigger("keydown", { key: "ArrowRight" });
        await find(wrapper, "afsBar").trigger("keydown", { key: "ArrowLeft" });
        expect(wrapper.emitted("seek")).toEqual([[155], [150]]);
    });

    it("follows the finger along the bar, and asks for the seek once, when it is let go", async () => {
        const wrapper = mountScreen();
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 200, pointerId: 1 });
        await bar.trigger("pointermove", { clientX: 250, pointerId: 1 });
        expect(find(wrapper, "afsElapsed").text()).toBe("6:00");
        expect(wrapper.emitted("seek")).toBeUndefined();
        await bar.trigger("pointerup", { pointerId: 1 });
        expect(wrapper.emitted("seek")).toEqual([[360]]);
        // Held where it was let go while the player catches up, rather than flicking back to 2:30.
        expect(find(wrapper, "afsElapsed").text()).toBe("6:00");
        await wrapper.setProps({ currentTime: 359.5 });
        await wrapper.setProps({ currentTime: 362 });
        expect(find(wrapper, "afsElapsed").text()).toBe("6:02");
    });

    it("opens for scrubbing on a finger tap instead of seeking, and holds the sound", async () => {
        const wrapper = mountScreen();
        await wrapper.setProps({ playing: true });
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 250, pointerId: 2, pointerType: "touch" });
        await bar.trigger("pointerup", { clientX: 250, pointerId: 2, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toBeUndefined();
        expect(wrapper.emitted("toggle-play")).toHaveLength(1);
        expect(bar.classes()).toContain("lmpl-afs-bar-open");
    });

    it("with frames, a finger tap shows the host its strip instead of thickening the bar", async () => {
        const wrapper = mountScreen();
        await wrapper.setProps({
            thumbnailAt: (() => ({ url: "sheet.jpg", x: 0, y: 0, w: 160, h: 90 })) as never,
        });
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 250, pointerId: 4, pointerType: "touch" });
        await bar.trigger("pointerup", { clientX: 250, pointerId: 4, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toBeUndefined();
        const scrubs = wrapper.emitted("scrub") ?? [];
        expect(scrubs.at(-1)?.[0]).toMatchObject({ held: true });
        expect(bar.classes()).not.toContain("lmpl-afs-bar-open");
    });

    it("stays open while a finger is on the host strip, and closes five seconds after it lifts", async () => {
        vi.useFakeTimers();
        try {
            const wrapper = mountScreen({}, { roster: '<div data-test="hostStrip"></div>' });
            await wrapper.setProps({
                thumbnailAt: (() => ({ url: "sheet.jpg", x: 0, y: 0, w: 160, h: 90 })) as never,
            });
            const bar = find(wrapper, "afsBar");
            bar.element.getBoundingClientRect = () => ({
                left: 100,
                width: 200,
                top: 0,
                height: 30,
                right: 300,
                bottom: 30,
                x: 100,
                y: 0,
                toJSON: () => ({}),
            });
            await bar.trigger("pointerdown", { clientX: 250, pointerId: 5, pointerType: "touch" });
            await bar.trigger("pointerup", { clientX: 250, pointerId: 5, pointerType: "touch" });
            const strip = wrapper.find('[data-test="hostStrip"]');
            await strip.trigger("pointerdown", { pointerId: 6, pointerType: "touch" });
            vi.advanceTimersByTime(10000);
            expect(wrapper.emitted("scrub")?.at(-1)?.[0]).not.toBeNull();
            await strip.trigger("pointerup", { pointerId: 6, pointerType: "touch" });
            vi.advanceTimersByTime(5000);
            expect(wrapper.emitted("scrub")?.at(-1)?.[0]).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("seeks once when a finger drags the bar and lets go", async () => {
        const wrapper = mountScreen();
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 200, pointerId: 3, pointerType: "touch" });
        await bar.trigger("pointermove", { clientX: 250, pointerId: 3, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toBeUndefined();
        await bar.trigger("pointerup", { clientX: 250, pointerId: 3, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toEqual([[360]]);
    });

    it("lets go of a seek the player never makes, after a moment", async () => {
        vi.useFakeTimers();
        try {
            const wrapper = mountScreen();
            await find(wrapper, "afsSkipForward").trigger("click");
            expect(find(wrapper, "afsElapsed").text()).toBe("2:40");
            vi.advanceTimersByTime(2000);
            await wrapper.vm.$nextTick();
            expect(find(wrapper, "afsElapsed").text()).toBe("2:30");
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("AudioFullscreen — a live stream", () => {
    it("has no skip buttons and says Live where the time left would be", () => {
        const wrapper = mountScreen({ duration: Infinity });
        expect(find(wrapper, "afsSkipBack").exists()).toBe(false);
        expect(find(wrapper, "afsSkipForward").exists()).toBe(false);
        expect(find(wrapper, "afsRemaining").exists()).toBe(false);
        expect(find(wrapper, "afsLive").text()).toBe("Live");
    });

    it("does the same when told it is live, whatever the length says", () => {
        const wrapper = mountScreen({ live: true });
        expect(find(wrapper, "afsLive").exists()).toBe(true);
        expect(find(wrapper, "afsSkipBack").exists()).toBe(false);
    });
});

describe("AudioFullscreen — what it asks for", () => {
    it("asks to leave fullscreen, and the host to open the chapters, from the button", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsExit").trigger("click");
        await find(wrapper, "afsBrowse").trigger("click");
        expect(wrapper.emitted("exit")).toHaveLength(1);
        expect(wrapper.emitted("open-browse")).toHaveLength(1);
    });

    it("asks to go to the chapter that is chosen", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        await wrapper.findAll(".lmpl-chapter")[3]!.trigger("click");
        expect(wrapper.emitted("seek-chapter")![0]).toEqual([chapters[3]]);
    });

    it("opens the speed menu, asks for a speed, and closes", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSpeed").trigger("click");
        const items = wrapper.findAll("[role=menuitemradio]");
        expect(items.map((i) => i.text())).toEqual(["0.75×", "1×", "1.25×", "1.5×", "1.75×", "2×"]);
        await items[3]!.trigger("click");
        expect(wrapper.emitted("rate")![0]).toEqual([1.5]);
        expect(wrapper.find("[role=menu]").exists()).toBe(false);
    });

    it("asks for a language from its menu", async () => {
        const wrapper = mountScreen({
            audioTracks: [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ],
        });
        await find(wrapper, "afsLanguage").trigger("click");
        await wrapper.findAll("[role=menuitemradio]")[1]!.trigger("click");
        expect(wrapper.emitted("audio-track")![0]).toEqual(["fr"]);
    });

    it("asks for a sleep timer in minutes, for the end of the chapter, and for none", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSleep").trigger("click");
        await find(wrapper, "afsSleep15").trigger("click");
        await find(wrapper, "afsSleep").trigger("click");
        await find(wrapper, "afsSleepChapter").trigger("click");
        await find(wrapper, "afsSleep").trigger("click");
        await find(wrapper, "afsSleepOff").trigger("click");
        expect(wrapper.emitted("sleep")).toEqual([
            [{ kind: "minutes", minutes: 15 }],
            [{ kind: "chapter" }],
            [null],
        ]);
    });

    it("offers the end of the chapter only when there is a chapter to end", async () => {
        const wrapper = mountScreen({ chapters: [], chapterIndex: -1 });
        await find(wrapper, "afsSleep").trigger("click");
        expect(find(wrapper, "afsSleepChapter").exists()).toBe(false);
    });
});

describe("AudioFullscreen — the sleep timer on show", () => {
    it("says how long is left on the button, and that it stops at the chapter end", () => {
        const minutes = mountScreen({
            sleepTimer: { kind: "minutes", endsAt: Date.now() + 14 * 60_000 + 5_000 },
        });
        expect(find(minutes, "afsSleepCaption").text()).toBe("15 min left");
        const chapter = mountScreen({ sleepTimer: { kind: "chapter", endTime: 180 } });
        expect(find(chapter, "afsSleepCaption").text()).toBe("End of chapter");
        expect(find(mountScreen(), "afsSleepCaption").exists()).toBe(false);
    });

    it("marks the entry that is running", async () => {
        const wrapper = mountScreen({ sleepTimer: { kind: "chapter", endTime: 180 } });
        await find(wrapper, "afsSleep").trigger("click");
        expect(find(wrapper, "afsSleepChapter").attributes("aria-checked")).toBe("true");
        expect(find(wrapper, "afsSleepOff").attributes("aria-checked")).toBe("false");
    });
});

describe("AudioFullscreen — chapters and up next", () => {
    const upNext = [
        { id: "a", title: "Next one", section: "Next in series" },
        { id: "b", title: "Other", section: "Related" },
    ];
    const rows = (wrapper: ReturnType<typeof mountScreen>) => wrapper.findAll(".lmpl-chapter");

    it("opens the web player's own panel over the screen from the button, with every chapter and the playing one marked", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
        await find(wrapper, "afsBrowse").trigger("click");
        expect(find(wrapper, "browsePanel").exists()).toBe(true);
        expect(rows(wrapper)).toHaveLength(8);
        expect(wrapper.find(".lmpl-chapter[aria-current=true]").text()).toContain("Chapter 3");
        expect(wrapper.emitted("open-browse")).toBeUndefined();
    });

    it("asks the host to show them when it is not given a panel of its own", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsBrowse").trigger("click");
        expect(wrapper.emitted("open-browse")).toHaveLength(1);
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });

    it("offers Up next as a second tab, and says which one is picked", async () => {
        const wrapper = mountScreen({ chaptersSheet: true, upNext });
        await find(wrapper, "afsBrowse").trigger("click");
        const tabs = wrapper.findAll("[role=tab]");
        expect(tabs.map((tab) => tab.text())).toEqual(["Chapters", "Up next"]);
        await tabs[1]!.trigger("click");
        const items = wrapper.findAll(".lmpl-upnext");
        expect(items).toHaveLength(2);
        await items[1]!.trigger("click");
        expect(wrapper.emitted("upnextselect")![0]).toEqual(["b"]);
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });

    it("goes to the chapter that is picked and closes, staying on this screen", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        await rows(wrapper)[5]!.trigger("click");
        expect(wrapper.emitted("seek-chapter")![0]).toEqual([chapters[5]]);
        expect(wrapper.emitted("exit")).toBeUndefined();
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });

    it("closes on Escape, with the close button, and on a press outside it", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        await find(wrapper, "browsePanel").trigger("keydown", { key: "Escape" });
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
        await find(wrapper, "afsBrowse").trigger("click");
        await wrapper.find(".lmpl-browse-close").trigger("click");
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
        await find(wrapper, "afsBrowse").trigger("click");
        await wrapper.find(".lmpl-browse-scrim").trigger("click");
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });
});

describe("AudioFullscreen — the menus", () => {
    it("close on Escape, and on a press outside them, but not on a press inside the tools", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSpeed").trigger("click");
        expect(wrapper.find("[role=menu]").exists()).toBe(true);

        await wrapper.trigger("keydown", { key: "Escape" });
        expect(wrapper.find("[role=menu]").exists()).toBe(false);

        await find(wrapper, "afsSpeed").trigger("click");
        await find(wrapper, "afsTitle").trigger("pointerdown");
        expect(wrapper.find("[role=menu]").exists()).toBe(false);

        await find(wrapper, "afsSpeed").trigger("click");
        await find(wrapper, "afsSpeed").trigger("pointerdown");
        expect(wrapper.find("[role=menu]").exists()).toBe(true);
    });

    it("are kept on the screen: no taller than the room above their button, and no further out than its edges", async () => {
        const rect = (left: number, top: number, width: number, height: number) => ({
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
            x: left,
            y: top,
            toJSON: () => ({}),
        });
        const spy = vi
            .spyOn(Element.prototype, "getBoundingClientRect")
            .mockImplementation(function (this: Element) {
                if (this.matches(".lmpl-afs")) return rect(0, 0, 844, 390) as DOMRect;
                if (this.matches(".lmpl-afs-tool")) return rect(700, 330, 52, 52) as DOMRect;
                if (this.matches("[role=menu]")) return rect(690, 30, 150, 290) as DOMRect;
                return rect(0, 0, 0, 0) as DOMRect;
            });
        try {
            const wrapper = mountScreen();
            await find(wrapper, "afsSleep").trigger("click");
            await wrapper.vm.$nextTick();
            const menu = wrapper.find("[role=menu]").element as HTMLElement;
            // 330 (the button's top) - 12 (the gap) - 8 (the margin) leaves 310 px.
            expect(menu.style.maxHeight).toBe("310px");
            // The menu ends at 840, past the 832 that keeps a 12 px margin: it moves 8 px in.
            expect(menu.style.translate).toBe("-8px 0");
        } finally {
            spy.mockRestore();
        }
    });

    it("open one at a time", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSpeed").trigger("click");
        await find(wrapper, "afsSleep").trigger("click");
        expect(wrapper.findAll("[role=menu]")).toHaveLength(1);
        expect(wrapper.find("[role=menu]").attributes("aria-label")).toBe("Sleep timer");
    });
});
