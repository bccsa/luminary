import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
    createInitialState,
    type PlayerControllerApi,
    type PlayerState,
} from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";
import BrowsePanel from "../components/BrowsePanel.vue";
import type { PlayerUpNextItem } from "../upNext";
import { DEFAULT_MESSAGES } from "../messages";

installTextTrackListShim();

// The Video.js elements need a real browser; as inert tags the panel, which is plain Vue, is what is tested.
vi.mock("../ui/register", () => ({}));

const CHAPTERS = [
    { startTime: 0, endTime: 60, title: "Intro" },
    { startTime: 60, endTime: 200, title: "Main" },
];
const UP_NEXT: PlayerUpNextItem[] = [
    {
        id: "n1",
        title: "Day 2",
        subtitle: "3 Oct 2026",
        imageUrl: "https://img/n1.jpg",
        section: "Next in series",
    },
    { id: "r1", title: "Other", section: "Related" },
];

function fakeController(state: Partial<PlayerState>): PlayerControllerApi {
    const current = { ...createInitialState(), ...state };
    return {
        load: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getState: () => current,
        subscribe: () => () => {},
    } as unknown as PlayerControllerApi;
}

// jsdom has no media playback; the keep-alive audio pauses on unmount.
HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

let wrapper: VueWrapper | undefined;

async function mountPlayer(
    props: Record<string, unknown>,
    state: Partial<PlayerState> = { chapters: CHAPTERS, currentTime: 70 },
) {
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: {
            source: { masterUrl: "https://x/master.m3u8" },
            createController: () => fakeController(state),
            ...props,
        },
    });
    await flushPromises();
    return wrapper;
}

async function setFullscreen(on: boolean) {
    Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => (on ? document.body : null),
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    await flushPromises();
}

const toggle = () => document.querySelector<HTMLElement>("[data-browse-toggle]")!;
const panel = () => document.querySelector<HTMLElement>(".lmpl-browse");

afterEach(async () => {
    await setFullscreen(false);
    wrapper?.unmount();
    wrapper = undefined;
});

describe("LuminaryPlayer casting, for a host that draws its own control", () => {
    it("says a device is around when the player's own cast button does, and opens its picker", async () => {
        const w = await mountPlayer({}, {});
        const vm = w.vm as unknown as { castAvailable: boolean; showCastPicker: () => void };
        expect(vm.castAvailable).toBe(false);

        const button = document.querySelector<HTMLElement>("media-cast-button")!;
        const clicked = vi.fn();
        button.addEventListener("click", clicked);
        button.setAttribute("data-availability", "available");
        await flushPromises();
        expect(vm.castAvailable).toBe(true);

        vm.showCastPicker();
        expect(clicked).toHaveBeenCalledTimes(1);

        button.setAttribute("data-availability", "unavailable");
        await flushPromises();
        expect(vm.castAvailable).toBe(false);
    });
});

describe("LuminaryPlayer and a host screen", () => {
    it("is not in full screen when the display is taken by the host's own marked screen, and is when it is another element", async () => {
        const w = await mountPlayer({}, {});
        const hostScreen = document.createElement("div");
        hostScreen.setAttribute("data-lmpl-host-screen", "");
        document.body.appendChild(hostScreen);
        Object.defineProperty(document, "fullscreenElement", {
            configurable: true,
            get: () => hostScreen,
        });
        document.dispatchEvent(new Event("fullscreenchange"));
        await flushPromises();
        expect(w.find(".lmpl-root").classes()).not.toContain("lmpl-is-fullscreen");

        await setFullscreen(true);
        expect(w.find(".lmpl-root").classes()).toContain("lmpl-is-fullscreen");
        hostScreen.remove();
    });
});

describe("LuminaryPlayer browse panel", () => {
    it("offers the button only when there are chapters or up-next items", async () => {
        const w = await mountPlayer({}, {});
        expect(w.find(".lmpl-root").classes()).not.toContain("lmpl-has-browse");
        await w.setProps({ upNext: UP_NEXT });
        expect(w.find(".lmpl-root").classes()).toContain("lmpl-has-browse");
    });

    it("opens in fullscreen with both tabs, the current chapter marked", async () => {
        const w = await mountPlayer({ upNext: UP_NEXT });
        await setFullscreen(true);
        toggle().click();
        await flushPromises();
        expect(panel()).not.toBeNull();
        expect(toggle().getAttribute("aria-expanded")).toBe("true");
        expect(
            [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent!.trim()),
        ).toEqual(["Chapters", "Up next"]);
        const rows = [...document.querySelectorAll(".lmpl-chapter")];
        expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([null, "true"]);
        expect(rows[1]!.textContent).toContain("1:00");
        expect(w.exists()).toBe(true);
    });

    it("does not open while windowed", async () => {
        await mountPlayer({ upNext: UP_NEXT });
        toggle().click();
        await flushPromises();
        expect(panel()).toBeNull();
    });

    it("hides a tab with no entries", async () => {
        await mountPlayer({ upNext: UP_NEXT }, {});
        await setFullscreen(true);
        toggle().click();
        await flushPromises();
        expect(
            [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent!.trim()),
        ).toEqual(["Up next"]);
    });

    it("seeks to a tapped chapter and closes", async () => {
        const w = await mountPlayer({});
        const media = w.find("hlsjs-video").element as unknown as { currentTime: number };
        await setFullscreen(true);
        toggle().click();
        await flushPromises();
        document.querySelectorAll<HTMLElement>(".lmpl-chapter")[1]!.click();
        await flushPromises();
        expect(media.currentTime).toBe(60);
        expect(panel()).toBeNull();
    });

    it("lists up-next rows under their section headings and raises upnextselect", async () => {
        const w = await mountPlayer({ upNext: UP_NEXT }, {});
        await setFullscreen(true);
        toggle().click();
        await flushPromises();
        expect(
            [...document.querySelectorAll(".lmpl-browse-heading")].map((h) => h.textContent),
        ).toEqual(["Next in series", "Related"]);
        expect(document.querySelector(".lmpl-upnext-thumb img")!.getAttribute("src")).toBe(
            "https://img/n1.jpg",
        );
        document.querySelectorAll<HTMLElement>(".lmpl-upnext")[0]!.click();
        await flushPromises();
        expect(w.emitted("upnextselect")).toEqual([["n1"]]);
        expect(panel()).toBeNull();
    });

    it("shows the player busy from a pick until something plays, for 15 s at most", async () => {
        await mountPlayer({ upNext: UP_NEXT }, {});
        await setFullscreen(true);
        vi.useFakeTimers();
        try {
            toggle().click();
            await nextTick();
            document.querySelectorAll<HTMLElement>(".lmpl-upnext")[0]!.click();
            await nextTick();
            expect(document.querySelector("[data-test='lmplBusy']")).not.toBeNull();
            vi.advanceTimersByTime(15_000);
            await nextTick();
            expect(document.querySelector("[data-test='lmplBusy']")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows the player busy while it waits for data it was asked to play, and not once it plays", async () => {
        await mountPlayer({}, { playing: true });
        const video = document.querySelector("hlsjs-video")!;
        video.dispatchEvent(new Event("waiting"));
        await nextTick();
        expect(document.querySelector("[data-test='lmplBusy']")).not.toBeNull();
        video.dispatchEvent(new Event("playing"));
        await nextTick();
        expect(document.querySelector("[data-test='lmplBusy']")).toBeNull();
    });

    it("closes on Escape, on the close button and on a tap outside", async () => {
        await mountPlayer({ upNext: UP_NEXT });
        await setFullscreen(true);
        const open = async () => {
            toggle().click();
            await flushPromises();
            expect(panel()).not.toBeNull();
        };

        await open();
        panel()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await flushPromises();
        expect(panel()).toBeNull();

        await open();
        document.querySelector<HTMLElement>(".lmpl-browse-close")!.click();
        await flushPromises();
        expect(panel()).toBeNull();

        await open();
        document.querySelector<HTMLElement>(".lmpl-browse-scrim")!.click();
        await flushPromises();
        expect(panel()).toBeNull();
    });

    it("closes on leaving fullscreen", async () => {
        await mountPlayer({ upNext: UP_NEXT });
        await setFullscreen(true);
        toggle().click();
        await flushPromises();
        await setFullscreen(false);
        expect(panel()).toBeNull();
    });

    it("moves between tabs with the arrow keys", async () => {
        await mountPlayer({ upNext: UP_NEXT });
        await setFullscreen(true);
        toggle().click();
        await flushPromises();
        const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]');
        expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
        tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        await flushPromises();
        expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(tabs[1]);
    });
});

const PANEL_CHAPTERS = [
    { startTime: 0, endTime: 60, title: "Opening" },
    { startTime: 60, endTime: 120, title: "Sermon" },
];

const mountPanel = (props: Record<string, unknown> = {}) =>
    mount(BrowsePanel, {
        props: {
            chapters: PANEL_CHAPTERS,
            currentChapter: 0,
            messages: DEFAULT_MESSAGES,
            idPrefix: "test",
            ...props,
        },
    });

describe("BrowsePanel — the chapters", () => {
    it("shows each chapter's preview frame from just after its start, cut out of the sprite sheet", () => {
        const asked: number[] = [];
        const wrapper = mountPanel({
            thumbnailAt: (seconds: number) => {
                asked.push(seconds);
                return {
                    start: seconds,
                    end: seconds + 5,
                    spriteUrl: "https://cdn/s.jpg",
                    x: 160,
                    y: 90,
                    w: 160,
                    h: 90,
                };
            },
        });
        const frames = wrapper.findAll("[data-test='chapterFrame']");
        expect(frames).toHaveLength(2);
        expect(asked).toEqual([0.5, 60.5]);
        const style = frames[0]!.attributes("style");
        expect(style).toContain("s.jpg");
        expect(style).toContain("-160px -90px");
    });

    it("keeps the chapter symbol while there are no thumbnails", () => {
        const wrapper = mountPanel();
        expect(wrapper.find("[data-test='chapterFrame']").exists()).toBe(false);
        expect(wrapper.findAll(".lmpl-chapter-tile svg")).toHaveLength(2);
    });
});

describe("BrowsePanel — up next", () => {
    const upNext: PlayerUpNextItem[] = [
        {
            id: "a",
            title: "With a picture",
            imageUrl: "https://img/a.jpg",
            fallbackImageUrl: "/assets/fallback-1.webp",
        },
        { id: "b", title: "Without one", fallbackImageUrl: "/assets/fallback-2.webp" },
    ];
    const pictures = (wrapper: ReturnType<typeof mountPanel>) =>
        wrapper
            .findAll(".lmpl-upnext-thumb")
            .map((thumb) => thumb.find("img").attributes("src") ?? null);

    it("shows the fallback picture for an item that has none of its own", () => {
        // As the strip near the end does: a plain grey tile reads as a picture that failed.
        const wrapper = mountPanel({ upNext, initialTab: "upnext" });
        expect(pictures(wrapper)).toEqual(["https://img/a.jpg", "/assets/fallback-2.webp"]);
    });

    it("falls back when an item's own picture fails to load", async () => {
        const wrapper = mountPanel({ upNext, initialTab: "upnext" });
        await wrapper.findAll(".lmpl-upnext-thumb img")[0]!.trigger("error");
        expect(pictures(wrapper)[0]).toBe("/assets/fallback-1.webp");
    });
});
