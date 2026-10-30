import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick } from "vue";

// State is module-level, so each test loads a fresh copy against the localStorage it sets up.
const loadModule = async () => {
    vi.resetModules();
    return import("./useReaderSettings");
};

describe("useReaderSettings", () => {
    beforeEach(() => {
        localStorage.removeItem("readerSettings");
    });

    it("defaults to the middle text size, prose line height and Inter", async () => {
        const { useReaderSettings, TEXT_SIZES } = await loadModule();
        const { textSize, lineHeight, font, articleStyle } = useReaderSettings();

        expect(TEXT_SIZES[textSize.value]).toBe(1);
        expect(lineHeight.value).toBe(1);
        expect(font.value).toBe("inter");
        expect(articleStyle.value).toMatchObject({
            "--reader-scale": "1",
            "--reader-line-height": "1.75",
        });
    });

    it("persists changes and restores them on the next load", async () => {
        const first = (await loadModule()).useReaderSettings();
        first.textSize.value = 4;
        first.font.value = "literata";
        await nextTick();

        const second = (await loadModule()).useReaderSettings();
        expect(second.textSize.value).toBe(4);
        expect(second.font.value).toBe("literata");
        expect(second.articleStyle.value["--reader-font" as never]).toContain("Literata");
    });

    it("ignores stored values it no longer understands", async () => {
        localStorage.setItem(
            "readerSettings",
            JSON.stringify({ textSize: 99, lineHeight: -1, font: "comic-sans" }),
        );
        const { textSize, lineHeight, font } = (await loadModule()).useReaderSettings();

        expect(textSize.value).toBe(2);
        expect(lineHeight.value).toBe(1);
        expect(font.value).toBe("inter");
    });

    it("keeps the text size within the available steps", async () => {
        const { useReaderSettings, TEXT_SIZES } = await loadModule();
        const { textSize } = useReaderSettings();

        textSize.value = -3;
        expect(textSize.value).toBe(0);
        textSize.value = 42;
        expect(textSize.value).toBe(TEXT_SIZES.length - 1);
    });
});
