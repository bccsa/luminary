import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import EncodeStatus from "./EncodeStatus.vue";

const errorOf = (error: string) =>
    mount(EncodeStatus, {
        props: { availability: "available", status: "failed", error },
    })
        .find("[data-test='encoder-error']")
        .text();

describe("EncodeStatus — the encoder's error", () => {
    it("shows a sentence written for the editor as it is", () => {
        const message =
            "The encode stopped before it finished. Open Luminary Media Convert to continue the encode or run it again.";
        expect(errorOf(message)).toBe(message);
    });

    it("never shows the tail of ffmpeg's output an older encoder sends", () => {
        const shown = errorOf(
            "FFmpeg exited with code null (signal: SIGKILL). stderr tail:\n" +
                "rk/5e8e5c53/output/stream_144p_256x for writing [hls @ 0x760d127700] Opening\n" +
                "'/Users/someone/Library/Application Support/Luminary Media Convert/work/…' frame= 3467",
        );

        expect(shown).toBe(
            "The encode failed. Open Luminary Media Convert to continue the encode or run it again.",
        );
        expect(shown).not.toMatch(/stderr|hls @|\/Users\//);
    });

    it("does not show a single line that runs on and on either", () => {
        expect(errorOf(`S3 upload failed: ${"x".repeat(400)}`)).toMatch(/^The encode failed\./);
    });
});
