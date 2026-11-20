import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
    createInitialState,
    type PlayerControllerApi,
    type PlayerState,
} from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { TIMELINE_SCRUB_IDLE_MS } from "../ui/timelineScrub";
import { installTextTrackListShim } from "./helpers";

installTextTrackListShim();

// The Video.js elements need a real browser; as inert tags the preview, which is plain Vue, is what is tested.
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

HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

let wrapper: VueWrapper | undefined;

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

async function mountPlayer() {
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: {
            source: { masterUrl: "https://x/master.m3u8" },
            createController: () => fakeController({ duration: 600, thumbnailsReady: true }),
        },
    });
    await flushPromises();
    Object.defineProperty(document.querySelector("hlsjs-video")!, "duration", { value: 600 });
    container().getBoundingClientRect = () => rect(0, 0, 1000, 560);
    document.querySelector<HTMLElement>(".lmpl-time-slider")!.getBoundingClientRect = () =>
        rect(100, 500, 800, 20);
}

const container = () => document.querySelector<HTMLElement>("media-container")!;
const preview = () => document.querySelector(".lmpl-scrub-preview");

async function pointer(type: string) {
    container().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 500, clientY: 510 }));
    await flushPromises();
}

async function setControlsShown(on: boolean) {
    if (on) container().setAttribute("data-controls-visible", "");
    else container().removeAttribute("data-controls-visible");
    await flushPromises();
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});

describe("LuminaryPlayer scrub preview and auto-hide", () => {
    it("drops the hover preview when the controls hide under a resting pointer", async () => {
        await mountPlayer();
        await setControlsShown(true);
        await pointer("pointermove");
        expect(preview()).not.toBeNull();

        await setControlsShown(false);
        expect(preview()).toBeNull();
    });

    it("keeps the preview of a held press when the controls hide", async () => {
        await mountPlayer();
        await setControlsShown(true);
        await pointer("pointerdown");
        expect(preview()).not.toBeNull();

        await setControlsShown(false);
        expect(preview()).not.toBeNull();
    });

    it("keeps the strip up for the idle time after a finger drags it, as the video plays on", async () => {
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
        await mountPlayer();
        const media = document.querySelector<HTMLMediaElement>("hlsjs-video")!;
        let paused = false;
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
        const touch = async (target: Element, type: string, clientX: number, clientY: number) => {
            const event = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY,
            });
            Object.assign(event, { pointerType: "touch", pointerId: 7 });
            target.dispatchEvent(event);
            await flushPromises();
        };
        const strip = () => document.querySelector(".lmpl-roster-interactive");

        // Only the timeouts: the open strip follows the playhead on animation frames, which must not be run here.
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
        try {
            await touch(container(), "pointerdown", 500, 510);
            await touch(container(), "pointerup", 500, 510);
            expect(strip()).not.toBeNull();

            await touch(strip()!, "pointerdown", 500, 400);
            await touch(strip()!, "pointermove", 460, 400);
            expect(paused).toBe(true);
            // The finger rests before it lifts, so the strip stops there rather than spinning on.
            vi.advanceTimersByTime(200);
            await touch(strip()!, "pointerup", 460, 400);
            expect(paused).toBe(false);
            expect(strip()).not.toBeNull();

            vi.advanceTimersByTime(TIMELINE_SCRUB_IDLE_MS - 100);
            await flushPromises();
            expect(strip()).not.toBeNull();
            vi.advanceTimersByTime(100);
            await flushPromises();
            expect(strip()).toBeNull();
        } finally {
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it("puts the strip away when the video is played some other way", async () => {
        await mountPlayer();
        const media = document.querySelector<HTMLMediaElement>("hlsjs-video")!;
        const event = new MouseEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: 500,
            clientY: 510,
        });
        Object.assign(event, { pointerType: "touch", pointerId: 8 });
        container().dispatchEvent(event);
        const up = new MouseEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            clientX: 500,
            clientY: 510,
        });
        Object.assign(up, { pointerType: "touch", pointerId: 8 });
        container().dispatchEvent(up);
        await flushPromises();
        const open = () => document.querySelector(".lmpl-scrubbing, .lmpl-scrub-bar") !== null;
        expect(open()).toBe(true);

        media.dispatchEvent(new Event("play"));
        await flushPromises();
        expect(open()).toBe(false);
    });
});
