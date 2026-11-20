import { describe, expect, it } from "vitest";
import { narrowToThisPlayer } from "../../../../scripts/narrow-skin.mjs";

const narrow = (css: string) => narrowToThisPlayer(css).replace(/\s+/g, " ").trim();

describe("narrowToThisPlayer", () => {
    it("strips the theme and preset this player always has", () => {
        expect(
            narrow(
                ':where(.media-skin[data-theme="default"][data-preset="video"]) .a { color: red }',
            ),
        ).toBe(":where(.media-skin) .a { color: red }");
    });

    it("drops a rule for another theme or preset", () => {
        expect(narrow(':where(.media-skin[data-theme="neutral"]) .a { color: red }')).toBe("");
        expect(narrow(':where(.media-skin[data-preset="audio"]) .a { color: red }')).toBe("");
    });

    it("keeps a rule that lists this preset beside another one", () => {
        expect(
            narrow(
                '.media-skin:is([data-preset="video"], [data-preset="live-video"]) { --media-frame-border: #0000001a }',
            ),
        ).toBe('.media-skin:is([data-preset="video"]) { --media-frame-border: #0000001a }');
    });

    it("drops a rule whose list names only other presets", () => {
        expect(
            narrow(
                '.media-skin:is([data-preset="audio"], [data-preset="live-audio"]) { color: red }',
            ),
        ).toBe("");
    });

    it("drops the theme-only alternative of a selector list and keeps the rest", () => {
        expect(
            narrow(
                ':where(.media-skin[data-theme="default"]) .a, .media-skin[data-theme="neutral"] .a { color: red }',
            ),
        ).toBe(":where(.media-skin) .a { color: red }");
    });

    it("narrows nested lists", () => {
        expect(narrow(':where(:where(.media-skin[data-theme="default"]) .a) { color: red }')).toBe(
            ":where(:where(.media-skin) .a) { color: red }",
        );
    });

    it("leaves an empty block out", () => {
        expect(
            narrow('@supports (color: red) { .media-skin[data-theme="neutral"] { color: red } }'),
        ).toBe("");
    });
});
