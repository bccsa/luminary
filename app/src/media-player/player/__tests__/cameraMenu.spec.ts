import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
    AUDIO_ONLY_ANGLE_ID,
    createInitialState,
    type PlayerControllerApi,
    type PlayerState,
} from "@luminary-media-converter/player-web";
import LuminaryPlayer from "../components/LuminaryPlayer.vue";
import { installTextTrackListShim } from "./helpers";

installTextTrackListShim();

// The Video.js elements need a real browser; as inert tags the markup the player writes is what is tested.
vi.mock("../ui/register", () => ({}));

// jsdom has no media playback; the keep-alive audio pauses on unmount.
HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.play = () => Promise.resolve();

const TWO_CAMERAS: Partial<PlayerState> = {
    angles: [
        { id: "Main", name: "Main", isDefault: true },
        { id: "Pulpit", name: "Pulpit", isDefault: false },
        { id: AUDIO_ONLY_ANGLE_ID, name: "Audio only", isDefault: false },
    ],
    activeAngleId: "Main",
};

/** A controller whose state the test moves on, as a real one does when an angle loads. */
function fakeController(initial: Partial<PlayerState>) {
    let current: PlayerState = { ...createInitialState(), ...initial };
    const listeners = new Set<(s: PlayerState) => void>();
    const controller = {
        load: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        setAngle: vi.fn().mockResolvedValue(undefined),
        getState: () => current,
        subscribe: (fn: (s: PlayerState) => void) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    };
    const set = (next: Partial<PlayerState>) => {
        current = { ...current, ...next };
        for (const fn of listeners) fn(current);
    };
    return { controller, set };
}

let wrapper: VueWrapper | undefined;

async function mountPlayer(state: Partial<PlayerState>) {
    const fake = fakeController(state);
    wrapper = mount(LuminaryPlayer, {
        attachTo: document.body,
        props: {
            source: { masterUrl: "https://x/master.m3u8" },
            createController: () => fake.controller as unknown as PlayerControllerApi,
        },
    });
    await flushPromises();
    return fake;
}

const root = () => document.querySelector<HTMLElement>(".lmpl-root")!;
const group = () =>
    document.querySelector<HTMLElement & { value: string }>("[data-camera-group]")!;
const items = () =>
    [...group().querySelectorAll("media-menu-radio-item")].map((i) => ({
        value: i.getAttribute("value"),
        text: i.textContent,
    }));

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});

describe("LuminaryPlayer camera card", () => {
    it("lists the video's cameras, not the sound-only rendering, with the one playing chosen", async () => {
        await mountPlayer(TWO_CAMERAS);
        expect(root().classList.contains("lmpl-has-camera-choice")).toBe(true);
        expect(items()).toEqual([
            { value: "Main", text: "Main" },
            { value: "Pulpit", text: "Pulpit" },
        ]);
        expect(group().value).toBe("Main");
    });

    it("loads the camera picked in it", async () => {
        const fake = await mountPlayer(TWO_CAMERAS);
        group().dispatchEvent(
            new CustomEvent("value-change", { detail: { value: "Pulpit" }, bubbles: true }),
        );
        expect(fake.controller.setAngle).toHaveBeenCalledWith("Pulpit");

        fake.set({ activeAngleId: "Pulpit" });
        await flushPromises();
        expect(group().value).toBe("Pulpit");
    });

    it("leaves the other settings' picks alone", async () => {
        const fake = await mountPlayer(TWO_CAMERAS);
        document
            .querySelector("media-quality-radio-group")!
            .dispatchEvent(new CustomEvent("value-change", { detail: { value: "720" }, bubbles: true }));
        expect(fake.controller.setAngle).not.toHaveBeenCalled();
    });

    it("offers no camera for a video with one picture", async () => {
        await mountPlayer({
            angles: [
                { id: "__default__", name: "Default", isDefault: true },
                { id: AUDIO_ONLY_ANGLE_ID, name: "Audio only", isDefault: false },
            ],
            activeAngleId: "__default__",
        });
        expect(root().classList.contains("lmpl-has-camera-choice")).toBe(false);
    });

    it("hides while only the sound plays, and lists a new video's cameras", async () => {
        const fake = await mountPlayer(TWO_CAMERAS);
        fake.set({ activeAngleId: AUDIO_ONLY_ANGLE_ID });
        await flushPromises();
        expect(root().classList.contains("lmpl-has-camera-choice")).toBe(false);

        fake.set({
            angles: [
                { id: "Stage", name: "Stage", isDefault: true },
                { id: "Choir", name: "Choir", isDefault: false },
            ],
            activeAngleId: "Stage",
        });
        await flushPromises();
        expect(root().classList.contains("lmpl-has-camera-choice")).toBe(true);
        expect(items().map((i) => i.value)).toEqual(["Stage", "Choir"]);
    });
});
