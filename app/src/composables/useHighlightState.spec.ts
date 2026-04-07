import { describe, it, expect } from "vitest";
import { useHighlightState } from "./useHighlightState";

describe("useHighlightState", () => {
    it("returns all expected refs with correct defaults", () => {
        const state = useHighlightState();

        expect(state.selectedText.value).toBe("");
        expect(state.isInteractingWithMenu.value).toBe(false);
        expect(state.isSelecting.value).toBe(false);
        expect(state.showActions.value).toBe(false);
        expect(state.actionPosition.value).toBeUndefined();
        expect(state.showHighlightColors.value).toBe(false);
        expect(state.justShownMenu.value).toBe(false);
        expect(state.isLongPress.value).toBe(false);
        expect(state.initialTouch.value).toBeNull();
        expect(state.touchSelection.value).toBeNull();
    });

    it("shares state across multiple calls (singleton pattern)", () => {
        const state1 = useHighlightState();
        const state2 = useHighlightState();

        state1.selectedText.value = "test text";
        expect(state2.selectedText.value).toBe("test text");

        state2.showActions.value = true;
        expect(state1.showActions.value).toBe(true);

        // Reset
        state1.selectedText.value = "";
        state1.showActions.value = false;
    });

    it("refs are reactive", () => {
        const state = useHighlightState();

        state.actionPosition.value = { x: 10, y: 20 };
        expect(state.actionPosition.value).toEqual({ x: 10, y: 20 });

        state.initialTouch.value = { x: 5, y: 15 };
        expect(state.initialTouch.value).toEqual({ x: 5, y: 15 });

        // Reset
        state.actionPosition.value = undefined;
        state.initialTouch.value = null;
    });
});
