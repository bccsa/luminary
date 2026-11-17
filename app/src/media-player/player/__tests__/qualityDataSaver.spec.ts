import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createInitialState, type PlayerControllerApi } from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";

installTextTrackListShim();

// The Video.js elements need a real browser; as inert tags the card's markup is what is tested.
vi.mock("../ui/register", () => ({}));

function fakeController(): PlayerControllerApi {
    const current = createInitialState();
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

async function mountPlayer(props: Record<string, unknown>) {
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: {
            source: { masterUrl: "https://x/master.m3u8" },
            createController: () => fakeController(),
            ...props,
        },
    });
    await flushPromises();
    return wrapper;
}

const toggle = () => document.querySelector<HTMLElement>("[data-data-saver]")!;

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});

describe("the quality card's Data Saver switch", () => {
    it("is hidden while the host gives no level", async () => {
        await mountPlayer({});
        expect(toggle().hidden).toBe(true);
        expect(document.querySelector(".lmpl-has-data-saver")).toBeNull();
    });

    it("shows the level and where its default comes from, and asks the host to flip it", async () => {
        const player = await mountPlayer({
            dataSaver: "off",
            messages: { dataSaver: "Data saver", dataSaverDefault: "Default from Settings: Off" },
        });
        expect(toggle().hidden).toBe(false);
        expect(document.querySelector(".lmpl-has-data-saver")).not.toBeNull();
        expect(toggle().getAttribute("aria-checked")).toBe("false");
        expect(toggle().textContent).toBe("Data saverDefault from Settings: Off");

        toggle().click();
        expect(player.emitted("nowplayingaction")).toEqual([["dataSaver", "light"]]);

        await player.setProps({ dataSaver: "light" });
        expect(toggle().getAttribute("aria-checked")).toBe("true");
        toggle().click();
        expect(player.emitted("nowplayingaction")?.at(-1)).toEqual(["dataSaver", "off"]);
    });
});
