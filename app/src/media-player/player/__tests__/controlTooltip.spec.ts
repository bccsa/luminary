import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    TOOLTIP_DELAY_MS,
    attachControlTooltips,
    clampTooltipLeft,
    controlLabel,
    tooltipFor,
    type Tooltip,
} from "../ui/controlTooltip";

describe("controlLabel", () => {
    it("is the label the control carries", () => {
        const button = document.createElement("button");
        button.setAttribute("aria-label", "  Enter fullscreen ");
        expect(controlLabel(button)).toBe("Enter fullscreen");
    });

    it("is the name a settings button keeps for a screen reader when it has no label", () => {
        const button = document.createElement("button");
        button.innerHTML = '<span class="media-settings-menu-trigger-label">Speed</span>';
        expect(controlLabel(button)).toBe("Speed");
    });

    it("is empty when there is neither", () => {
        expect(controlLabel(document.createElement("button"))).toBe("");
    });

    it("follows the label as it changes, since nothing is copied", () => {
        const button = document.createElement("button");
        button.setAttribute("aria-label", "Enter fullscreen");
        button.setAttribute("aria-label", "Exit fullscreen");
        expect(controlLabel(button)).toBe("Exit fullscreen");
    });
});

describe("tooltipFor and clampTooltipLeft", () => {
    it("centres on the control, and sits above it by the gap", () => {
        const tip = tooltipFor(
            { left: 300, width: 40, top: 500 },
            { left: 100, bottom: 600 },
            "Speed",
        );
        expect(tip).toEqual({ text: "Speed", centre: 220, bottom: 110 });
    });

    it("is centred when there is room", () => {
        expect(clampTooltipLeft(200, 80, 600)).toBe(160);
    });

    it("stays inside the container at both edges", () => {
        expect(clampTooltipLeft(10, 80, 600)).toBe(8);
        expect(clampTooltipLeft(595, 80, 600)).toBe(512);
    });

    it("keeps to the left edge when the name is wider than the container", () => {
        expect(clampTooltipLeft(50, 700, 600)).toBe(8);
    });
});

describe("attachControlTooltips", () => {
    let container: HTMLElement;
    let tips: (Tooltip | null)[];
    let detach: () => void;

    const pointer = (
        type: string,
        target: Element,
        init: { pointerType?: string; relatedTarget?: Node | null } = {},
    ) => {
        const event = new MouseEvent(type, {
            bubbles: true,
            relatedTarget: init.relatedTarget ?? null,
        });
        Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "mouse" });
        target.dispatchEvent(event);
    };

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement("div");
        container.innerHTML =
            '<div class="lmpl-actions-row">' +
            '<button class="lmpl-icon-btn" id="a" aria-label="Mute"><i id="icon"></i></button>' +
            '<button class="lmpl-icon-btn" id="b" aria-label="Speed"></button>' +
            '<button class="lmpl-icon-btn lmpl-vstep" id="step" aria-label="Volume up"></button>' +
            '<button class="lmpl-icon-btn" id="blank"></button>' +
            "</div>";
        document.body.appendChild(container);
        tips = [];
        detach = attachControlTooltips(container, (tip) => tips.push(tip));
    });

    afterEach(() => {
        detach();
        container.remove();
        vi.useRealTimers();
    });

    const el = (id: string) => container.querySelector<HTMLElement>(`#${id}`)!;

    it("names a control after a short rest on it, not at once", () => {
        pointer("pointerover", el("a"));
        expect(tips).toEqual([]);
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
        expect(tips).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(tips.at(-1)?.text).toBe("Mute");
    });

    it("shows nothing for a pass over the row that does not rest", () => {
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(100);
        pointer("pointerout", el("a"));
        pointer("pointerover", el("b"));
        vi.advanceTimersByTime(100);
        pointer("pointerout", el("b"));
        vi.advanceTimersByTime(1000);
        expect(tips).toEqual([]);
    });

    it("takes the name away when the pointer leaves, and gives the next control its own", () => {
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        pointer("pointerout", el("a"));
        expect(tips.at(-1)).toBeNull();

        pointer("pointerover", el("b"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        expect(tips.at(-1)?.text).toBe("Speed");
    });

    it("names the next control without the pause when it follows straight on from a name", () => {
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        pointer("pointerout", el("a"));
        pointer("pointerover", el("b"));
        vi.advanceTimersByTime(0);
        expect(tips.at(-1)?.text).toBe("Speed");
    });

    it("goes back to the pause once the pointer has rested elsewhere", () => {
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        pointer("pointerout", el("a"));
        vi.advanceTimersByTime(1000);
        pointer("pointerover", el("b"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
        expect(tips.at(-1)).toBeNull();
    });

    it("stays while the pointer moves between the parts of one control", () => {
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        const before = tips.length;
        pointer("pointerout", el("a"), { relatedTarget: el("icon") });
        pointer("pointerover", el("icon"));
        expect(tips).toHaveLength(before);
    });

    it("is not shown for a touch", () => {
        pointer("pointerover", el("a"), { pointerType: "touch" });
        vi.advanceTimersByTime(1000);
        expect(tips).toEqual([]);
    });

    it("is not shown for the volume card buttons, or a control with no name", () => {
        pointer("pointerover", el("step"));
        vi.advanceTimersByTime(1000);
        pointer("pointerout", el("step"));
        pointer("pointerover", el("blank"));
        vi.advanceTimersByTime(1000);
        expect(tips.filter(Boolean)).toEqual([]);
    });

    it("goes when the control is pressed or clicked, so it does not sit over the menu it opens", () => {
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        pointer("pointerdown", el("a"));
        expect(tips.at(-1)).toBeNull();

        pointer("pointerover", el("b"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        el("b").click();
        expect(tips.at(-1)).toBeNull();
    });

    it("goes on Escape", () => {
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        el("a").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(tips.at(-1)).toBeNull();
    });

    it("does nothing more once detached", () => {
        detach();
        pointer("pointerover", el("a"));
        vi.advanceTimersByTime(1000);
        expect(tips).toEqual([]);
    });
});
