import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AUTO_HIDE_MS, installAutoHide, type ControlsStore } from "../ui/autoHide";

function fakeStore() {
    let locks = 0;
    const releases: Mock<[], void>[] = [];
    const calls: string[] = [];
    const store: ControlsStore = {
        requestControlsLock: vi.fn(() => {
            calls.push("lock");
            locks++;
            store.controlsVisible = true;
            const release = vi.fn((): void => {
                calls.push("release");
                locks--;
            });
            releases.push(release);
            return release;
        }),
        toggleControls: vi.fn((show?: boolean) => {
            calls.push(`toggle(${show})`);
            // As v10: a held lock keeps the controls up whatever the toggle asks.
            store.controlsVisible = locks > 0 || (show ?? !store.controlsVisible);
            return store.controlsVisible;
        }),
        controlsVisible: false,
    };
    return { store, releases, calls };
}

let target: HTMLElement;

beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement("div");
});

afterEach(() => {
    vi.useRealTimers();
});

const move = () => target.dispatchEvent(new Event("pointermove"));

describe("installAutoHide", () => {
    it("keeps the controls up for as long as the host holds them", () => {
        const { store, calls } = fakeStore();
        let held = true;
        installAutoHide(
            target,
            () => store,
            AUTO_HIDE_MS,
            () => held,
        );
        move();
        vi.advanceTimersByTime(AUTO_HIDE_MS * 3);
        expect(calls).not.toContain("toggle(false)");
        held = false;
        vi.advanceTimersByTime(AUTO_HIDE_MS);
        expect(calls).toContain("toggle(false)");
    });

    it("waits three seconds, not v10's two", () => {
        expect(AUTO_HIDE_MS).toBe(3000);
        const { store, calls } = fakeStore();
        installAutoHide(target, () => store);
        move();
        vi.advanceTimersByTime(2999);
        expect(calls).not.toContain("toggle(false)");
        vi.advanceTimersByTime(1);
        expect(calls).toContain("toggle(false)");
    });

    it("holds the controls up while the pointer is active, so v10's own timer cannot hide them early", () => {
        const { store } = fakeStore();
        installAutoHide(target, () => store);
        move();
        expect(store.requestControlsLock).toHaveBeenCalledOnce();
    });

    it("takes one lock however much the pointer moves", () => {
        const { store } = fakeStore();
        installAutoHide(target, () => store);
        for (let i = 0; i < 20; i++) move();
        expect(store.requestControlsLock).toHaveBeenCalledOnce();
    });

    it("starts the three seconds again on every movement", () => {
        const { store, calls } = fakeStore();
        installAutoHide(target, () => store);
        move();
        vi.advanceTimersByTime(2500);
        move();
        vi.advanceTimersByTime(2500);
        expect(calls).not.toContain("toggle(false)");
        vi.advanceTimersByTime(500);
        expect(calls).toContain("toggle(false)");
    });

    it("releases the lock before hiding: releasing alone would start v10's 2 s timer and make it 5", () => {
        const { store, calls } = fakeStore();
        installAutoHide(target, () => store);
        move();
        vi.advanceTimersByTime(3000);
        expect(calls).toEqual(["lock", "release", "toggle(false)"]);
    });

    it("takes a new lock for the next burst of activity", () => {
        const { store } = fakeStore();
        installAutoHide(target, () => store);
        move();
        vi.advanceTimersByTime(3000);
        move();
        expect(store.requestControlsLock).toHaveBeenCalledTimes(2);
    });

    it.each(["pointerdown", "pointerup"])("counts %s as activity", (type) => {
        const { store } = fakeStore();
        installAutoHide(target, () => store);
        target.dispatchEvent(new Event(type));
        expect(store.requestControlsLock).toHaveBeenCalledOnce();
    });

    it("does nothing before the player has a store", () => {
        installAutoHide(target, () => undefined);
        expect(() => {
            move();
            vi.advanceTimersByTime(5000);
        }).not.toThrow();
    });

    it("gives the lock back and stops its timer when uninstalled", () => {
        const { store, releases, calls } = fakeStore();
        const uninstall = installAutoHide(target, () => store);
        move();
        uninstall();
        expect(releases[0]).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(5000);
        expect(calls).not.toContain("toggle(false)");
        move();
        expect(store.requestControlsLock).toHaveBeenCalledOnce();
    });

    it("does not release twice on a hide followed by an uninstall", () => {
        const { store, releases } = fakeStore();
        const uninstall = installAutoHide(target, () => store);
        move();
        vi.advanceTimersByTime(3000);
        uninstall();
        expect(releases[0]).toHaveBeenCalledOnce();
    });
});

describe("installAutoHide with a finger", () => {
    const touch = (type: string) => {
        const event = new Event(type, { bubbles: true });
        Object.defineProperty(event, "pointerType", { value: "touch" });
        return event;
    };
    /** A tap on the picture: v10 toggles the controls from its own pointerup listener on the container. */
    function tap(store: ControlsStore, child: HTMLElement) {
        child.dispatchEvent(touch("pointerdown"));
        child.dispatchEvent(touch("pointerup"));
        vi.advanceTimersByTime(0);
    }

    it("lets a tap on the picture hide controls that are showing", () => {
        const { store } = fakeStore();
        const child = target.appendChild(document.createElement("div"));
        installAutoHide(target, () => store);
        target.addEventListener("pointerup", () => store.toggleControls());
        move();
        expect(store.controlsVisible).toBe(true);
        tap(store, child);
        expect(store.controlsVisible).toBe(false);
        expect(store.requestControlsLock).toHaveBeenCalledOnce();
    });

    it("keeps controls a tap brought up for three seconds", () => {
        const { store, calls } = fakeStore();
        const child = target.appendChild(document.createElement("div"));
        installAutoHide(target, () => store);
        target.addEventListener("pointerup", () => store.toggleControls());
        tap(store, child);
        expect(store.controlsVisible).toBe(true);
        expect(store.requestControlsLock).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(2999);
        expect(calls).not.toContain("toggle(false)");
        vi.advanceTimersByTime(1);
        expect(store.controlsVisible).toBe(false);
    });

    it("does not bring hidden controls up for a finger's down or movement alone", () => {
        const { store } = fakeStore();
        installAutoHide(target, () => store);
        target.dispatchEvent(touch("pointerdown"));
        target.dispatchEvent(touch("pointermove"));
        expect(store.requestControlsLock).not.toHaveBeenCalled();
    });
});
