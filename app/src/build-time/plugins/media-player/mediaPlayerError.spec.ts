import { describe, it, expect } from "vitest";
import { mediaPlayerErrorFromElement } from "./mediaPlayerError";

describe("mediaPlayerErrorFromElement", () => {
    it("maps network errors as retryable", () => {
        const audio = document.createElement("audio");
        Object.defineProperty(audio, "error", {
            value: { code: 2 },
            configurable: true,
        });

        expect(mediaPlayerErrorFromElement(audio)).toEqual({
            message: "Network error. Please check your internet connection.",
            code: 2,
            retryable: true,
        });
    });

    it("maps unsupported format as non-retryable", () => {
        const audio = document.createElement("audio");
        Object.defineProperty(audio, "error", {
            value: { code: 4 },
            configurable: true,
        });

        expect(mediaPlayerErrorFromElement(audio).retryable).toBe(false);
    });

    it("returns a generic message when the element has no error detail", () => {
        const audio = document.createElement("audio");

        expect(mediaPlayerErrorFromElement(audio)).toEqual({
            message: "Audio playback failed",
            retryable: true,
        });
    });
});
