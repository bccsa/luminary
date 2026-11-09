import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createInitialState, type PlayerControllerApi } from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";

installTextTrackListShim();

vi.mock("../ui/register", () => ({}));

const observed: Element[] = [];
class RecordingResizeObserver {
    observe(target: Element) {
        observed.push(target);
    }
    unobserve() {}
    disconnect() {}
}

let wrapper: VueWrapper | undefined;

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    observed.length = 0;
    vi.unstubAllGlobals();
});

describe("LuminaryPlayer frame width", () => {
    // Fullscreen is entered on the container, so the outer element keeps its windowed width and a strip sized
    // from it stops part-way across the screen (#2510).
    it("measures the element that goes fullscreen", async () => {
        vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
        wrapper = mount(LuminaryPlayer, {
            attachTo: document.body,
            props: {
                source: { masterUrl: "https://x/master.m3u8" },
                createController: () =>
                    ({
                        load: vi.fn().mockResolvedValue(undefined),
                        destroy: vi.fn(),
                        getState: () => createInitialState(),
                        subscribe: () => () => {},
                        thumbnailAt: () => null,
                    }) as unknown as PlayerControllerApi,
            },
        });
        await flushPromises();

        expect(observed).toContain(document.querySelector("media-container"));
    });
});
