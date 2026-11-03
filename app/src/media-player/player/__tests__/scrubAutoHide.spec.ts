import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
    createInitialState,
    type PlayerControllerApi,
    type PlayerState,
} from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
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
});
