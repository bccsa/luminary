import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createInitialState, type PlayerControllerApi } from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";

installTextTrackListShim();

vi.mock("../ui/register", () => ({}));

function fakeController(): PlayerControllerApi {
    const state = {
        ...createInitialState(),
        duration: 600,
        qualities: [
            { id: "q360", height: 360, label: "360p" },
            { id: "q720", height: 720, label: "720p" },
        ],
        activeQualityId: "q360",
        audioTracks: [
            { id: "a-en", lang: "en", label: "English" },
            { id: "a-fr", lang: "fr", label: "Français" },
        ],
        activeAudioTrackId: "a-fr",
        subtitleTracks: [{ id: "s-fr", lang: "fr", label: "Français" }],
        activeSubtitleTrackId: "s-fr",
    };
    return {
        load: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getState: () => state,
        subscribe: () => () => {},
        thumbnailAt: () => null,
        readSubtitleCues: vi.fn().mockResolvedValue([]),
    } as unknown as PlayerControllerApi;
}

let wrapper: VueWrapper | undefined;

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});

describe("LuminaryPlayer control bar badges", () => {
    it("tags only the subtitles button, not quality or sound language (#2565)", async () => {
        wrapper = mount(LuminaryPlayer, {
            attachTo: document.body,
            props: {
                source: { masterUrl: "https://x/master.m3u8" },
                createController: fakeController,
            },
        });
        await flushPromises();
        const button = (kind: string) => document.querySelector<HTMLElement>(`.lmpl-opt-${kind}`)!;
        expect(button("captions").dataset.badge).toBe("FR");
        expect(button("quality").dataset.badge).toBeUndefined();
        expect(button("audio").dataset.badge).toBeUndefined();
    });
});
