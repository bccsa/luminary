import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
    createInitialState,
    type PlayerControllerApi,
    type PlayerState,
} from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";
import type { PlayerUpNextItem } from "../upNext";

installTextTrackListShim();

// The Video.js elements need a real browser; as inert tags the card, which is plain Vue, is what is tested.
vi.mock("../ui/register", () => ({}));

const NEXT: PlayerUpNextItem[] = [
    {
        id: "n1",
        title: "Day 2",
        subtitle: "3 Oct 2026",
        imageUrl: "https://img/n1.jpg",
        section: "Next in series",
    },
    { id: "r1", title: "Other", section: "Related" },
    { id: "r2", title: "Third" },
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

HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

let wrapper: VueWrapper | undefined;

async function mountPlayer(
    props: Record<string, unknown>,
    state: Partial<PlayerState> = { duration: 600, currentTime: 595 },
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

async function setControlsShown(on: boolean) {
    const container = document.querySelector("media-container")!;
    if (on) container.setAttribute("data-controls-visible", "");
    else container.removeAttribute("data-controls-visible");
    await flushPromises();
}

const card = () => document.querySelector<HTMLElement>(".lmpl-nextup");

afterEach(async () => {
    await setFullscreen(false);
    wrapper?.unmount();
    wrapper = undefined;
});

describe("LuminaryPlayer up next card", () => {
    it("shows in fullscreen with 10 seconds or less left, with title, label and actions", async () => {
        await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        expect(card()).not.toBeNull();
        expect(card()!.getAttribute("aria-label")).toBe("Up next");
        expect(card()!.querySelector(".lmpl-nextup-label")!.textContent).toBe("Up next");
        const cards = [...card()!.querySelectorAll(".lmpl-nextup-card")];
        expect(cards.map((c) => c.querySelector(".lmpl-nextup-title")!.textContent)).toEqual([
            "Day 2",
            "Other",
            "Third",
        ]);
        expect(cards.every((c) => c.tagName === "BUTTON")).toBe(true);
        expect(cards[0]!.querySelector("img")!.getAttribute("src")).toBe("https://img/n1.jpg");
        expect(card()!.querySelector(".lmpl-nextup-subtitle")).toBeNull();
        expect(cards[0]!.querySelector(".lmpl-nextup-section")!.textContent).toBe("Next in series");
        expect(card()!.querySelector(".lmpl-nextup-close")!.getAttribute("aria-label")).toBe(
            "Dismiss",
        );
    });

    it("shows at exactly 10 seconds and not at 11", async () => {
        await mountPlayer({ nextUp: NEXT }, { duration: 600, currentTime: 590 });
        await setFullscreen(true);
        expect(card()).not.toBeNull();
        wrapper!.unmount();
        await mountPlayer({ nextUp: NEXT }, { duration: 600, currentTime: 589 });
        await setFullscreen(true);
        expect(card()).toBeNull();
    });

    it("leaves most of a short clip uncovered", async () => {
        // A 1:16 video: not at 0:16, only in its last ten seconds.
        await mountPlayer({ nextUp: NEXT }, { duration: 76, currentTime: 16 });
        await setFullscreen(true);
        expect(card()).toBeNull();
    });

    it("never shows outside fullscreen", async () => {
        await mountPlayer({ nextUp: NEXT });
        expect(card()).toBeNull();
    });

    it("does not show for a live or unknown length", async () => {
        await mountPlayer({ nextUp: NEXT }, { duration: Infinity, currentTime: 100 });
        await setFullscreen(true);
        expect(card()).toBeNull();
        wrapper!.unmount();
        await mountPlayer({ nextUp: NEXT }, { duration: 0, currentTime: 0 });
        await setFullscreen(true);
        expect(card()).toBeNull();
    });

    it("does not show without a next video", async () => {
        await mountPlayer({ nextUp: [] });
        await setFullscreen(true);
        expect(card()).toBeNull();
    });

    it("sits at the edge with the controls hidden and rides above them when shown", async () => {
        await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        // The app's jsdom lets Video.js show the controls on mount; this case starts from hidden.
        await setControlsShown(false);
        expect(card()!.classList.contains("lmpl-nextup-raised")).toBe(false);
        await setControlsShown(true);
        expect(card()!.classList.contains("lmpl-nextup-raised")).toBe(true);
        await setControlsShown(false);
        expect(card()!.classList.contains("lmpl-nextup-raised")).toBe(false);
    });

    it("raises nextupselect for the picked card, once, and hides", async () => {
        const w = await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        card()!.querySelectorAll<HTMLElement>(".lmpl-nextup-card")[1]!.click();
        await flushPromises();
        expect(w.emitted("nextupselect")).toEqual([["r1"]]);
        expect(card()).toBeNull();
    });

    it("offers at most five cards", async () => {
        const many = Array.from({ length: 14 }, (_, i) => ({ id: `v${i}`, title: `V${i}` }));
        await mountPlayer({ nextUp: many });
        await setFullscreen(true);
        expect(card()!.querySelectorAll(".lmpl-nextup-card")).toHaveLength(5);
    });

    it("moves between cards with the arrow keys", async () => {
        await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        const cards = [...card()!.querySelectorAll<HTMLElement>(".lmpl-nextup-card")];
        cards[0]!.focus();
        cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(cards[1]);
        cards[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        expect(document.activeElement).toBe(cards[0]);
        cards[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        expect(document.activeElement).toBe(cards[2]);
    });

    it("advances to the first card when the video ends in fullscreen, before ended is raised", async () => {
        const w = await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        const order: unknown[][] = [];
        w.vm.$.emit = ((...args: unknown[]) => void order.push(args)) as never;
        w.find("hlsjs-video").element.dispatchEvent(new Event("ended"));
        await flushPromises();
        expect(order.map((e) => e[0])).toEqual(["nextupselect", "ended"]);
        expect(order[0]![1]).toBe("n1");
    });

    it("does not advance on ended when dismissed", async () => {
        const w = await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        card()!.querySelector<HTMLElement>(".lmpl-nextup-close")!.click();
        await flushPromises();
        expect(w.emitted("nextupdismiss")).toHaveLength(1);
        expect(card()).toBeNull();
        w.find("hlsjs-video").element.dispatchEvent(new Event("ended"));
        await flushPromises();
        expect(w.emitted("nextupselect")).toBeUndefined();
        expect(w.emitted("ended")).toHaveLength(1);
    });

    it("does not advance on ended outside fullscreen", async () => {
        const w = await mountPlayer({ nextUp: NEXT });
        w.find("hlsjs-video").element.dispatchEvent(new Event("ended"));
        await flushPromises();
        expect(w.emitted("nextupselect")).toBeUndefined();
    });

    it("dismisses on Escape", async () => {
        const w = await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        card()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await flushPromises();
        expect(w.emitted("nextupdismiss")).toHaveLength(1);
        expect(card()).toBeNull();
    });

    it("offers itself again for a new source, still in fullscreen", async () => {
        const w = await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        card()!.querySelector<HTMLElement>(".lmpl-nextup-close")!.click();
        await flushPromises();
        expect(card()).toBeNull();
        await w.setProps({ source: { masterUrl: "https://x/other.m3u8" } });
        await flushPromises();
        expect(card()).not.toBeNull();
    });
});

describe("LuminaryPlayer up next pictures", () => {
    it("tries the picture, then its fallback, then draws nothing", async () => {
        await mountPlayer({
            nextUp: [
                {
                    id: "a",
                    title: "A",
                    imageUrl: "https://img/a.jpg",
                    fallbackImageUrl: "https://img/fallback.jpg",
                },
            ],
        });
        await setFullscreen(true);
        const img = () => card()!.querySelector(".lmpl-nextup-thumb img");
        expect(img()!.getAttribute("src")).toBe("https://img/a.jpg");
        img()!.dispatchEvent(new Event("error"));
        await flushPromises();
        expect(img()!.getAttribute("src")).toBe("https://img/fallback.jpg");
        img()!.dispatchEvent(new Event("error"));
        await flushPromises();
        expect(img()).toBeNull();
    });

    it("goes straight to the fallback for a card with no picture", async () => {
        await mountPlayer({
            nextUp: [{ id: "a", title: "A", fallbackImageUrl: "https://img/fallback.jpg" }],
        });
        await setFullscreen(true);
        expect(card()!.querySelector(".lmpl-nextup-thumb img")!.getAttribute("src")).toBe(
            "https://img/fallback.jpg",
        );
    });

    it("offers the width ladder as a srcset", async () => {
        await mountPlayer({
            nextUp: [
                {
                    id: "a",
                    title: "A",
                    imageUrl: "https://img/a.jpg",
                    imageSrcset: "https://img/a.jpg 480w, https://img/b.jpg 960w",
                },
            ],
        });
        await setFullscreen(true);
        expect(card()!.querySelector(".lmpl-nextup-thumb img")!.getAttribute("srcset")).toContain(
            "960w",
        );
    });
});

describe("up next strip alignment", () => {
    it("right-aligns the cards with an auto margin, not a flex-end scroller", async () => {
        const { readFileSync } = await import("node:fs");
        const css = readFileSync(`${process.cwd()}/src/media-player/player/styles.css`, "utf8");
        expect(css).toMatch(/\.lmpl-nextup-item:first-child\s*{\s*margin-inline-start:\s*auto;/);
        const strip = css.match(/\.lmpl-nextup-strip\s*{[^}]*}/)![0];
        expect(strip).not.toMatch(/justify-content/);
    });

    it("keeps the natural order, first item first", async () => {
        await mountPlayer({ nextUp: NEXT });
        await setFullscreen(true);
        const titles = [...card()!.querySelectorAll(".lmpl-nextup-title")].map(
            (t) => t.textContent,
        );
        expect(titles).toEqual(["Day 2", "Other", "Third"]);
        const head = card()!.querySelector(".lmpl-nextup-head")!;
        expect(head.firstElementChild!.className).toContain("lmpl-nextup-label");
        expect(head.lastElementChild!.className).toContain("lmpl-nextup-close");
    });

    it("takes its inset from the control bar, so the edges line up at every scale", async () => {
        const { readFileSync } = await import("node:fs");
        const css = readFileSync(`${process.cwd()}/src/media-player/player/styles.css`, "utf8");
        const nextup = css.match(/\.lmpl-root \.lmpl-nextup\s*{[^}]*position: absolute[^}]*}/)![0];
        expect(nextup).toContain("left: max(var(--lmpl-edge), env(safe-area-inset-left))");
        expect(nextup).toContain("right: max(var(--lmpl-edge), env(safe-area-inset-right))");
        // Every rule that sets the controls' inset sets the strip's too.
        const sets = (css.match(/--lmpl-edge:/g) ?? []).length;
        const withStrip = (
            css.match(
                /\.lmpl-root \.lmpl-controls-content,\s*\.lmpl-root \.lmpl-nextup\s*{\s*--lmpl-edge:/g,
            ) ?? []
        ).length;
        expect(withStrip).toBe(sets);
    });
});
