import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createInitialState, type PlayerControllerApi } from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";

installTextTrackListShim();

vi.mock("../ui/register", () => ({}));

function fakeController(): PlayerControllerApi {
    const state = { ...createInitialState(), duration: 600 };
    return {
        load: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getState: () => state,
        subscribe: () => () => {},
        thumbnailAt: () => null,
    } as unknown as PlayerControllerApi;
}

type Handle = { play(): Promise<boolean>; pause(): void };

let wrapper: VueWrapper | undefined;

/** A media element whose seek is under way until `seeked` is fired, and whose play() can be undone by the engine. */
async function mountWithMedia() {
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: { source: { masterUrl: "https://x/master.m3u8" }, createController: fakeController },
    });
    await flushPromises();
    const media = document.querySelector<HTMLElement>("hlsjs-video")!;
    const el = { paused: true, seeking: false };
    Object.defineProperty(media, "paused", { get: () => el.paused, configurable: true });
    Object.defineProperty(media, "seeking", { get: () => el.seeking, configurable: true });
    const play = vi.fn(() => {
        el.paused = false;
        return Promise.resolve();
    });
    const pause = vi.fn(() => {
        el.paused = true;
    });
    Object.defineProperty(media, "play", { value: play, configurable: true });
    Object.defineProperty(media, "pause", { value: pause, configurable: true });
    return { media, el, play, pause, handle: wrapper.vm as unknown as Handle };
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});

describe("LuminaryPlayer play during a seek", () => {
    it("plays again once the seek lands when the seek left it paused", async () => {
        const { media, el, play, handle } = await mountWithMedia();
        el.seeking = true;
        await handle.play();
        expect(play).toHaveBeenCalledTimes(1);
        // The engine drops playback while it fetches where the seek lands.
        el.paused = true;
        el.seeking = false;
        media.dispatchEvent(new Event("seeked"));
        expect(play).toHaveBeenCalledTimes(2);
        expect(el.paused).toBe(false);
    });

    it("does not play again once the seek lands when it is still playing", async () => {
        const { media, el, play, handle } = await mountWithMedia();
        el.seeking = true;
        await handle.play();
        el.seeking = false;
        media.dispatchEvent(new Event("seeked"));
        expect(play).toHaveBeenCalledTimes(1);
    });

    it("a pause asked for before the seek lands is kept", async () => {
        const { media, el, play, handle } = await mountWithMedia();
        el.seeking = true;
        await handle.play();
        handle.pause();
        el.seeking = false;
        media.dispatchEvent(new Event("seeked"));
        expect(play).toHaveBeenCalledTimes(1);
        expect(el.paused).toBe(true);
    });

    it("waits for nothing when no seek is under way", async () => {
        const { media, el, play, handle } = await mountWithMedia();
        await handle.play();
        el.paused = true;
        media.dispatchEvent(new Event("seeked"));
        expect(play).toHaveBeenCalledTimes(1);
    });
});
