import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actsOnPress, attachPressActivation, pressTarget } from "../ui/pressActivate";

/** jsdom has no `PointerEvent`: a mouse event carrying its fields stands in. */
function press(
    target: Element,
    init: { button?: number; isPrimary?: boolean; pointerType?: string } = {},
): MouseEvent {
    const { button = 0, isPrimary = true, pointerType = "mouse" } = init;
    const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button });
    Object.defineProperties(event, {
        isPrimary: { value: isPrimary },
        pointerType: { value: pointerType },
    });
    target.dispatchEvent(event);
    return event;
}

function release(target: Element): void {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
}

describe("pressTarget", () => {
    it("finds the media button around what was pressed, and how it may be pressed", () => {
        document.body.innerHTML =
            "<media-seek-button><svg><text>10</text></svg></media-seek-button><media-play-button></media-play-button><media-fullscreen-button></media-fullscreen-button>";
        expect(pressTarget(document.querySelector("text"))?.kind).toBe("any");
        expect(pressTarget(document.querySelector("media-play-button"))?.kind).toBe("play");
        expect(pressTarget(document.querySelector("media-fullscreen-button"))?.kind).toBe(
            "activation",
        );
    });

    it("reads the kind a host button is marked with", () => {
        document.body.innerHTML =
            '<button data-lmpl-press></button><button data-lmpl-press="play"></button><button data-lmpl-press="activation"></button>';
        const [any, play, activation] = document.querySelectorAll("button");
        expect(pressTarget(any)?.kind).toBe("any");
        expect(pressTarget(play)?.kind).toBe("play");
        expect(pressTarget(activation)?.kind).toBe("activation");
    });

    it("leaves what opens a card, and menu rows, to their click", () => {
        document.body.innerHTML =
            '<media-mute-button commandfor="v"></media-mute-button><button commandfor="m"></button><button role="menuitemradio"></button>';
        for (const el of document.body.children) expect(pressTarget(el)).toBeNull();
    });
});

describe("actsOnPress", () => {
    it("acts on every media button for a mouse or a pen", () => {
        for (const pointer of ["mouse", "pen"]) {
            expect(actsOnPress("activation", pointer, false)).toBe(true);
            expect(actsOnPress("play", pointer, false)).toBe(true);
        }
    });

    it("keeps fullscreen and a first play on the release for a finger, which only then grants an activation", () => {
        expect(actsOnPress("any", "touch", false)).toBe(true);
        expect(actsOnPress("activation", "touch", true)).toBe(false);
        expect(actsOnPress("play", "touch", false)).toBe(false);
        expect(actsOnPress("play", "touch", true)).toBe(true);
    });
});

describe("attachPressActivation", () => {
    let container: HTMLElement;
    let button: HTMLButtonElement;
    let onClick: ReturnType<typeof vi.fn>;
    let detach: () => void;
    let started = false;

    beforeEach(() => {
        started = false;
        document.body.innerHTML =
            '<div id="c"><button data-lmpl-press="play"><span>icon</span></button><button id="menu" commandfor="m"></button></div>';
        container = document.getElementById("c")!;
        button = container.querySelector("button")!;
        onClick = vi.fn();
        button.addEventListener("click", onClick);
        detach = attachPressActivation(container, () => started);
    });

    afterEach(() => detach());

    it("acts on the press, and not again on the release", () => {
        const down = press(button.querySelector("span")!);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(down.defaultPrevented).toBe(true);
        release(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("acts on each press of a quick double press", () => {
        press(button);
        release(button);
        press(button);
        release(button);
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("waits for the release when a finger presses play before anything has played", () => {
        press(button, { pointerType: "touch" });
        expect(onClick).not.toHaveBeenCalled();
        release(button);
        expect(onClick).toHaveBeenCalledTimes(1);
        started = true;
        press(button, { pointerType: "touch" });
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("ignores a secondary button and a second finger", () => {
        press(button, { button: 2 });
        press(button, { isPrimary: false });
        expect(onClick).not.toHaveBeenCalled();
    });

    it("lets a click elsewhere through after a press", () => {
        const menu = container.querySelector<HTMLButtonElement>("#menu")!;
        const onMenu = vi.fn();
        menu.addEventListener("click", onMenu);
        press(button);
        release(menu);
        expect(onMenu).toHaveBeenCalledTimes(1);
    });

    it("lets a key click through when the press never clicked", () => {
        press(button);
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        release(button);
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("stops once detached", () => {
        detach();
        press(button);
        expect(onClick).not.toHaveBeenCalled();
    });
});
