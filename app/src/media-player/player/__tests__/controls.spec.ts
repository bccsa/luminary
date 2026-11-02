import { describe, it, expect } from "vitest";
import { mergeControls, DEFAULT_CONTROLS } from "../controls";

describe("mergeControls", () => {
    it("is the library default when nothing is overridden", () => {
        expect(mergeControls()).toEqual(DEFAULT_CONTROLS);
        expect(mergeControls({})).toEqual(DEFAULT_CONTROLS);
    });

    it("takes a sparse override and inherits the rest", () => {
        // So adding an option later cannot change what an existing caller gets.
        expect(mergeControls({ audioMenu: false })).toEqual({
            ...DEFAULT_CONTROLS,
            audioMenu: false,
        });
    });

    it('honours 0 as "no button"', () => {
        expect(mergeControls({ skipForwardSeconds: 0 }).skipForwardSeconds).toBe(0);
    });

    it("ignores an interval that cannot be seeked to", () => {
        // NaN would travel into seek() and strand the video; a negative forward
        // skip is not a configuration anyone means.
        expect(mergeControls({ skipForwardSeconds: NaN }).skipForwardSeconds).toBe(10);
        expect(mergeControls({ skipBackSeconds: -5 }).skipBackSeconds).toBe(10);
        expect(
            mergeControls({ skipForwardSeconds: "30" as unknown as number }).skipForwardSeconds,
        ).toBe(10);
        expect(mergeControls({ audioMenu: 1 as unknown as boolean }).audioMenu).toBe(true);
    });

    it("offers the roster and the picture preview unless a host turns them off", () => {
        expect(DEFAULT_CONTROLS.scrubRoster).toBe(true);
        expect(DEFAULT_CONTROLS.scrubPicture).toBe(true);
        expect(mergeControls({ scrubRoster: false }).scrubRoster).toBe(false);
        expect(mergeControls({ scrubPicture: false }).scrubPicture).toBe(false);
    });

    it("no longer offers an audio/video toggle: another experience owns it", () => {
        expect(DEFAULT_CONTROLS).not.toHaveProperty("audioVideoToggle");
        expect(mergeControls({ audioVideoToggle: false } as never)).not.toHaveProperty(
            "audioVideoToggle",
        );
    });
});
