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

// The Video.js elements need a real browser; as inert tags the warm, which is plain Vue, is what is tested.
vi.mock("../ui/register", () => ({}));

HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

// Three sheets of 125 s each, as the encoder lays a 375 s video out.
function fakeController(state: Partial<PlayerState>): PlayerControllerApi {
    const current = { ...createInitialState(), ...state };
    return {
        load: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getState: () => current,
        subscribe: () => () => {},
        thumbnailAt: (t: number) => {
            if (t < 0 || t >= 375) return null;
            const frame = Math.floor(t / 5);
            return {
                startTime: frame * 5,
                endTime: frame * 5 + 5,
                spriteUrl: `https://x/sprite_${Math.floor(frame / 25)}.jpg`,
                x: 0,
                y: 0,
                w: 160,
                h: 90,
            };
        },
    } as unknown as PlayerControllerApi;
}

let wrapper: VueWrapper | undefined;
let loaded: string[];

beforeEach(() => {
    loaded = [];
    vi.stubGlobal(
        "Image",
        class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(url: string) {
                loaded.push(url);
                setTimeout(() => this.onload?.());
            }
        },
    );
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
});

async function sheetsFetched(state: Partial<PlayerState>, lazyThumbnails?: boolean) {
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: {
            source: { masterUrl: "https://x/master.m3u8" },
            lazyThumbnails,
            createController: () =>
                fakeController({ duration: 375, thumbnailsReady: true, ...state }),
        },
    });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 20));
    return loaded;
}

describe("LuminaryPlayer sprite sheet warm", () => {
    it("fetches every sheet up front", async () => {
        expect(await sheetsFetched({})).toEqual([
            "https://x/sprite_0.jpg",
            "https://x/sprite_1.jpg",
            "https://x/sprite_2.jpg",
        ]);
    });

    it("saving data, fetches only the first sheet; the rest load as they are reached", async () => {
        expect(await sheetsFetched({}, true)).toEqual(["https://x/sprite_0.jpg"]);
    });

    it("with only sound playing, fetches only the first sheet", async () => {
        expect(await sheetsFetched({ isAudioOnly: true })).toEqual(["https://x/sprite_0.jpg"]);
    });
});
