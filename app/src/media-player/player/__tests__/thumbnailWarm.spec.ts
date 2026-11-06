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

// Ten sheets of 125 s each, as the encoder lays a 1250 s video out.
function fakeController(initial: Partial<PlayerState>) {
    let current = { ...createInitialState(), ...initial } as PlayerState;
    const listeners = new Set<(state: PlayerState) => void>();
    const controller = {
        load: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getState: () => current,
        subscribe: (listener: (state: PlayerState) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        thumbnailAt: (t: number) => {
            if (t < 0 || t >= 1250) return null;
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
    const set = async (patch: Partial<PlayerState>) => {
        current = { ...current, ...patch };
        listeners.forEach((listener) => listener(current));
        // Each sheet that loads frees a slot for the next one, a few promise hops later.
        for (let i = 0; i < 20; i++) await flushPromises();
    };
    return { controller, set };
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
            fetchPriority = "";
            set src(url: string) {
                if (!url) return;
                expect(this.fetchPriority).toBe("low");
                loaded.push(url);
                queueMicrotask(() => this.onload?.());
            }
        },
    );
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
});

async function mountPlayer(lazyThumbnails?: boolean) {
    const fake = fakeController({ duration: 1250, thumbnailsReady: true, currentTime: 600 });
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: {
            source: { masterUrl: "https://x/master.m3u8" },
            lazyThumbnails,
            createController: () => fake.controller,
        },
    });
    await flushPromises();
    return fake;
}

const sheet = (n: number) => `https://x/sprite_${n}.jpg`;

describe("LuminaryPlayer sprite sheet warm", () => {
    it("waits for playback to start with some buffer, takes the window, then the rest", async () => {
        const { set } = await mountPlayer();
        expect(loaded).toEqual([]);

        await set({ playing: true, bufferedEnd: 605 });
        expect(loaded).toEqual([]);

        // 600 s is in sheet 4: it and the three each side.
        await set({ bufferedEnd: 612 });
        expect(new Set(loaded)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7].map(sheet)));
        expect(loaded.slice(0, 1)).toEqual([sheet(4)]);

        await set({ bufferedEnd: 640 });
        expect(new Set(loaded)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(sheet)));
        expect(loaded).toHaveLength(10);
    });

    it("fetches nothing more while playback stalls", async () => {
        const { set } = await mountPlayer();
        await set({ playing: true, stalled: true, bufferedEnd: 640 });
        expect(loaded).toEqual([]);
        await set({ stalled: false });
        expect(loaded).toHaveLength(10);
    });

    it("saving data, fetches only the playhead's sheet", async () => {
        const { set } = await mountPlayer(true);
        await set({ playing: true, bufferedEnd: 640 });
        expect(loaded).toEqual([sheet(4)]);
    });

    it("with only sound playing, fetches only the playhead's sheet, and the rest once the picture is back", async () => {
        const { set } = await mountPlayer();
        await set({ isAudioOnly: true, playing: true, bufferedEnd: 640 });
        expect(loaded).toEqual([sheet(4)]);
        await set({ isAudioOnly: false });
        expect(loaded).toHaveLength(10);
    });
});
