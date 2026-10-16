import { describe, expect, it } from "vitest";
import { leaveToPage, shortcutFor } from "../useMediaPlayerShortcuts";

const key = (key: string, init: KeyboardEventInit = {}) =>
    new KeyboardEvent("keydown", { key, ...init });

function on(element: Element, event: KeyboardEvent) {
    Object.defineProperty(event, "target", { value: element });
    return event;
}

describe("shortcutFor", () => {
    it("maps the transport keys", () => {
        expect(shortcutFor(key(" "))).toEqual({ type: "togglePlay" });
        expect(shortcutFor(key("k"))).toEqual({ type: "togglePlay" });
        expect(shortcutFor(key("ArrowLeft"))).toEqual({ type: "skip", seconds: -10 });
        expect(shortcutFor(key("j"))).toEqual({ type: "skip", seconds: -10 });
        expect(shortcutFor(key("ArrowRight"))).toEqual({ type: "skip", seconds: 10 });
        expect(shortcutFor(key("L", { shiftKey: true }))).toEqual({ type: "skip", seconds: 10 });
        expect(shortcutFor(key("m"))).toEqual({ type: "toggleMute" });
        expect(shortcutFor(key("f"))).toEqual({ type: "toggleFullscreen" });
        expect(shortcutFor(key("c"))).toEqual({ type: "toggleSubtitles" });
        expect(shortcutFor(key("ArrowUp"))).toEqual({ type: "volume", direction: 1 });
        expect(shortcutFor(key("ArrowDown"))).toEqual({ type: "volume", direction: -1 });
    });

    it("jumps to a tenth of the way for each digit, and to the start and end", () => {
        expect(shortcutFor(key("0"))).toEqual({ type: "seekToFraction", fraction: 0 });
        expect(shortcutFor(key("7"))).toEqual({ type: "seekToFraction", fraction: 0.7 });
        expect(shortcutFor(key("Home"))).toEqual({ type: "seekToFraction", fraction: 0 });
        expect(shortcutFor(key("End"))).toEqual({ type: "seekToFraction", fraction: 1 });
    });

    it("changes speed with Shift and the angle brackets, and goes to the next item with Shift+N only", () => {
        expect(shortcutFor(key(">", { shiftKey: true }))).toEqual({ type: "rate", direction: 1 });
        expect(shortcutFor(key("<", { shiftKey: true }))).toEqual({ type: "rate", direction: -1 });
        expect(shortcutFor(key("N", { shiftKey: true }))).toEqual({ type: "next" });
        // Caps Lock alone is not Shift+N.
        expect(shortcutFor(key("N"))).toBeNull();
        expect(shortcutFor(key("n"))).toBeNull();
    });

    it("leaves keys held with Ctrl, Cmd or Alt to the browser and the page (Cmd+K opens search)", () => {
        expect(shortcutFor(key("k", { metaKey: true }))).toBeNull();
        expect(shortcutFor(key("f", { ctrlKey: true }))).toBeNull();
        expect(shortcutFor(key("ArrowLeft", { altKey: true }))).toBeNull();
    });

    it("ignores other keys", () => {
        expect(shortcutFor(key("a"))).toBeNull();
        expect(shortcutFor(key("Escape"))).toBeNull();
        expect(shortcutFor(key("Tab"))).toBeNull();
    });
});

describe("leaveToPage", () => {
    it("leaves every key to a field being typed in", () => {
        const input = document.createElement("input");
        const textarea = document.createElement("textarea");
        const editable = document.createElement("div");
        editable.contentEditable = "true";
        // jsdom has no layout, so it does not derive isContentEditable from the attribute.
        Object.defineProperty(editable, "isContentEditable", { value: true });

        expect(leaveToPage(on(input, key("k")), false)).toBe(true);
        expect(leaveToPage(on(textarea, key(" ")), false)).toBe(true);
        expect(leaveToPage(on(editable, key("m")), false)).toBe(true);
    });

    it("leaves to a focused control the keys it acts on, but not the letters", () => {
        const button = document.createElement("button");
        const range = document.createElement("input");
        range.type = "range";
        const tab = document.createElement("div");
        tab.setAttribute("role", "tab");

        expect(leaveToPage(on(button, key(" ")), false)).toBe(true);
        expect(leaveToPage(on(button, key("Enter")), false)).toBe(true);
        expect(leaveToPage(on(range, key("ArrowRight")), false)).toBe(true);
        expect(leaveToPage(on(tab, key("ArrowLeft")), false)).toBe(true);

        expect(leaveToPage(on(button, key("k")), false)).toBe(false);
        expect(leaveToPage(on(range, key("m")), false)).toBe(false);
    });

    it("leaves every key to the page while a modal is open, or once something else handled it", () => {
        expect(leaveToPage(on(document.body, key("k")), true)).toBe(true);

        const handled = on(document.body, key("k", { cancelable: true }));
        handled.preventDefault();
        expect(leaveToPage(handled, false)).toBe(true);
    });

    it("takes the keys pressed anywhere else on the page", () => {
        expect(leaveToPage(on(document.body, key(" ")), false)).toBe(false);
        expect(leaveToPage(on(document.body, key("ArrowUp")), false)).toBe(false);
    });
});
