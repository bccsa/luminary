import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { ScreenWakeKey } from "@/build-time/contracts/screen-wake/token";
import { useKeepScreenAwake } from "./useKeepScreenAwake";

const IDLE_MS = 1000;

describe("useKeepScreenAwake", () => {
    let setKeepAwake: ReturnType<typeof vi.fn>;
    let wrapper: VueWrapper | undefined;

    function mountHost() {
        const Host = defineComponent({
            setup() {
                useKeepScreenAwake(IDLE_MS);
                return () => h("div");
            },
        });
        wrapper = mount(Host, {
            global: { provide: { [ScreenWakeKey as symbol]: { setKeepAwake } } },
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        setKeepAwake = vi.fn();
    });

    afterEach(() => {
        wrapper?.unmount();
        wrapper = undefined;
        document.body.innerHTML = "";
        vi.useRealTimers();
    });

    it("holds the screen on while mounted", () => {
        mountHost();

        expect(setKeepAwake).toHaveBeenCalledTimes(1);
        expect(setKeepAwake).toHaveBeenLastCalledWith(true);
    });

    it("releases the screen once the user has been idle for the timeout", () => {
        mountHost();

        vi.advanceTimersByTime(IDLE_MS - 1);
        expect(setKeepAwake).toHaveBeenLastCalledWith(true);

        vi.advanceTimersByTime(1);
        expect(setKeepAwake).toHaveBeenLastCalledWith(false);
    });

    it("extends the hold on activity, including scrolls of inner containers", () => {
        mountHost();
        const scroller = document.body.appendChild(document.createElement("div"));

        vi.advanceTimersByTime(IDLE_MS - 100);
        scroller.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(IDLE_MS - 100);

        expect(setKeepAwake).not.toHaveBeenCalledWith(false);

        vi.advanceTimersByTime(100);
        expect(setKeepAwake).toHaveBeenLastCalledWith(false);
    });

    it("takes the screen back on the first interaction after going idle", () => {
        mountHost();
        vi.advanceTimersByTime(IDLE_MS);

        document.dispatchEvent(new Event("pointerdown"));

        expect(setKeepAwake.mock.calls).toEqual([[true], [false], [true]]);
    });

    it("only reports changes, not every interaction", () => {
        mountHost();

        document.dispatchEvent(new Event("pointerdown"));
        document.dispatchEvent(new Event("keydown"));

        expect(setKeepAwake).toHaveBeenCalledTimes(1);
    });

    it("keeps holding while a video plays", () => {
        mountHost();
        const video = document.body.appendChild(document.createElement("video"));
        Object.defineProperty(video, "paused", { value: false });

        vi.advanceTimersByTime(IDLE_MS * 3);

        expect(setKeepAwake).not.toHaveBeenCalledWith(false);
    });

    it("releases the screen and stops listening on unmount", () => {
        mountHost();
        wrapper!.unmount();
        wrapper = undefined;

        expect(setKeepAwake).toHaveBeenLastCalledWith(false);

        document.dispatchEvent(new Event("pointerdown"));
        vi.advanceTimersByTime(IDLE_MS * 2);
        expect(setKeepAwake).toHaveBeenCalledTimes(2);
    });

    it("does nothing when no screen-wake service is provided", () => {
        const Host = defineComponent({
            setup() {
                useKeepScreenAwake(IDLE_MS);
                return () => h("div");
            },
        });

        expect(() => {
            wrapper = mount(Host);
            vi.advanceTimersByTime(IDLE_MS);
        }).not.toThrow();
    });
});
