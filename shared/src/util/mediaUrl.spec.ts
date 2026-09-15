import { describe, it, expect } from "vitest";
import { isBucketRelative, toAbsoluteMediaUrl } from "./mediaUrl";

describe("isBucketRelative", () => {
    it("calls a leading-slash path relative to the bucket", () => {
        expect(isBucketRelative("/abc/master.m3u8")).toBe(true);
    });

    it("calls an absolute URL external", () => {
        expect(isBucketRelative("https://cdn.example.com/abc/master.m3u8")).toBe(false);
    });

    it("has an answer for a URL that is not there", () => {
        expect(isBucketRelative(undefined)).toBe(false);
    });
});

describe("toAbsoluteMediaUrl", () => {
    const BUCKET = "https://cdn.example.com/media";

    it("joins a relative path onto the bucket's public URL", () => {
        expect(toAbsoluteMediaUrl("/abc/master.m3u8", BUCKET)).toBe(
            "https://cdn.example.com/media/abc/master.m3u8",
        );
    });

    it("leaves media hosted elsewhere untouched", () => {
        const external = "https://other.example.com/x/master.m3u8";

        expect(toAbsoluteMediaUrl(external, BUCKET)).toBe(external);
    });

    it("answers undefined for a relative path with no bucket to measure it against", () => {
        // Half a URL is worse than none: it would fetch something wrong.
        expect(toAbsoluteMediaUrl("/abc/master.m3u8", undefined)).toBeUndefined();
    });

    it("passes nothing through as nothing", () => {
        expect(toAbsoluteMediaUrl(undefined, BUCKET)).toBeUndefined();
    });

    it("does not double the separator when the bucket URL ends in one", () => {
        expect(toAbsoluteMediaUrl("/abc/master.m3u8", `${BUCKET}/`)).toBe(
            "https://cdn.example.com/media/abc/master.m3u8",
        );
    });

    it("trims a run of trailing slashes rather than one", () => {
        expect(toAbsoluteMediaUrl("/abc/master.m3u8", `${BUCKET}////`)).toBe(
            "https://cdn.example.com/media/abc/master.m3u8",
        );
    });

    it("does not backtrack over a long run of slashes", () => {
        // The `/\/+$/` this replaced is quadratic when the run does *not* end the
        // string — measured at 2.8s for 100k — and a library takes what it is given.
        const pathological = `${"/".repeat(100_000)}x`;

        const started = Date.now();
        const resolved = toAbsoluteMediaUrl("/a.m3u8", pathological);

        expect(Date.now() - started).toBeLessThan(500);
        expect(resolved).toBe(`${pathological}/a.m3u8`);
    });

    it("has nothing left to join when the bucket URL is only slashes", () => {
        expect(toAbsoluteMediaUrl("/abc/master.m3u8", "////")).toBe("/abc/master.m3u8");
    });
});
