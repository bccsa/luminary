import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
    createInitialState,
    type PlayerControllerApi,
    type PlayerState,
} from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";

installTextTrackListShim();

// The Video.js elements need a real browser; as inert tags the strip, which is plain Vue, is what is tested.
vi.mock("../ui/register", () => ({}));

const CUE = { start: 0, end: 600, spriteUrl: "https://x/sprite.jpg", x: 0, y: 0, w: 160, h: 90 };

function fakeController(state: Partial<PlayerState>): PlayerControllerApi {
    const current = { ...createInitialState(), ...state };
    return {
        load: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getState: () => current,
        subscribe: () => () => {},
        thumbnailAt: () => CUE,
    } as unknown as PlayerControllerApi;
}

const rect = (left: number, top: number, width: number, height: number) =>
    ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
    }) as DOMRect;

let wrapper: VueWrapper | undefined;
const container = () => document.querySelector<HTMLElement>("media-container")!;
const strip = () => document.querySelector(".lmpl-roster-interactive");

async function touch(target: Element, type: string, clientX: number, clientY: number) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.assign(event, { pointerType: "touch", pointerId: 7 });
    target.dispatchEvent(event);
    await flushPromises();
}

/** The player with its strip opened by a tap on the timeline; `seeks` records every seek of the video. */
async function openStrip() {
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: {
            source: { masterUrl: "https://x/master.m3u8" },
            createController: () => fakeController({ duration: 600, thumbnailsReady: true }),
        },
    });
    await flushPromises();
    const media = document.querySelector<HTMLMediaElement>("hlsjs-video")!;
    const seeks: number[] = [];
    let now = 100;
    let paused = false;
    Object.defineProperty(media, "duration", { value: 600 });
    Object.defineProperty(media, "currentTime", {
        get: () => now,
        set: (time: number) => {
            now = time;
            seeks.push(time);
        },
    });
    Object.defineProperty(media, "paused", { get: () => paused });
    Object.defineProperty(media, "pause", {
        value: () => {
            paused = true;
            media.dispatchEvent(new Event("pause"));
        },
    });
    Object.defineProperty(media, "play", {
        value: () => {
            paused = false;
            media.dispatchEvent(new Event("play"));
            return Promise.resolve();
        },
    });
    container().getBoundingClientRect = () => rect(0, 0, 1000, 560);
    document.querySelector<HTMLElement>(".lmpl-time-slider")!.getBoundingClientRect = () =>
        rect(100, 500, 800, 20);
    await touch(container(), "pointerdown", 500, 510);
    await touch(container(), "pointerup", 500, 510);
    expect(strip()).not.toBeNull();
    return seeks;
}

/** 100 px of finger travel leftwards, at `msPerMove` between moves; the finger lifts with `end`. */
async function drag(msPerMove: number, end = "pointerup") {
    await touch(strip()!, "pointerdown", 600, 400);
    for (let x = 580; x >= 500; x -= 20) {
        vi.advanceTimersByTime(msPerMove);
        await touch(strip()!, "pointermove", x, 400);
    }
    await touch(strip()!, end, 500, 400);
}

beforeEach(() => {
    // The strip is drawn to the frame's measured width, which jsdom never reports.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            constructor(private readonly report: ResizeObserverCallback) {}
            observe() {
                this.report(
                    [{ contentRect: { width: 1000, height: 560 } } as ResizeObserverEntry],
                    this as unknown as ResizeObserver,
                );
            }
            unobserve() {}
            disconnect() {}
        },
    );
    vi.useFakeTimers({
        toFake: [
            "requestAnimationFrame",
            "cancelAnimationFrame",
            "performance",
            "setTimeout",
            "clearTimeout",
        ],
    });
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("LuminaryPlayer: a flicked strip spins", () => {
    it("runs on after a flick, further than a slow drag, and seeks once where it stops", async () => {
        const seeks = await openStrip();
        await drag(200);
        expect(seeks).toHaveLength(1);
        const slow = seeks[0];
        expect(slow).toBeGreaterThan(100);

        seeks.length = 0;
        await drag(16);
        // Still spinning: the video has not moved yet.
        expect(seeks).toHaveLength(0);
        vi.advanceTimersByTime(3000);
        await flushPromises();
        expect(seeks).toHaveLength(1);
        expect(seeks[0] - slow).toBeGreaterThan(slow - 100);
    });

    it("does not seek when the strip is closed mid-spin", async () => {
        const seeks = await openStrip();
        await drag(16);
        vi.advanceTimersByTime(100);
        await flushPromises();
        // A press on the picture, off the strip and the timeline, puts the strip away.
        await touch(container(), "pointerdown", 500, 100);
        await touch(container(), "pointerup", 500, 100);
        expect(strip()).toBeNull();
        vi.advanceTimersByTime(3000);
        await flushPromises();
        expect(seeks).toHaveLength(0);
    });

    it("drops a spin, without its seek, when the timeline is pressed mid-spin", async () => {
        const seeks = await openStrip();
        await drag(16);
        vi.advanceTimersByTime(100);
        await touch(container(), "pointerdown", 500, 510);
        vi.advanceTimersByTime(3000);
        await flushPromises();
        expect(seeks).toHaveLength(0);
    });

    it("spins on a moved drag the browser cancels, as the now-playing strip does", async () => {
        const seeks = await openStrip();
        await drag(16, "pointercancel");
        expect(seeks).toHaveLength(0);
        vi.advanceTimersByTime(3000);
        await flushPromises();
        expect(seeks).toHaveLength(1);
        expect(seeks[0]).toBeGreaterThan(100);
    });
});
