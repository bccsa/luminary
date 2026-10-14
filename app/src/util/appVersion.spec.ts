import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./appVersion";

describe("isNewerVersion", () => {
    it("detects a later patch, minor or major version", () => {
        expect(isNewerVersion("1.9.5", "1.9.4")).toBe(true);
        expect(isNewerVersion("1.10.0", "1.9.4")).toBe(true);
        expect(isNewerVersion("2.0.0", "1.9.4")).toBe(true);
    });

    it("compares parts as numbers", () => {
        expect(isNewerVersion("10.0.0", "9.9.9")).toBe(true);
        expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
    });

    it("is false for the same or an earlier version", () => {
        expect(isNewerVersion("1.9.4", "1.9.4")).toBe(false);
        expect(isNewerVersion("1.9.3", "1.9.4")).toBe(false);
        expect(isNewerVersion("1.9.4", "2.0.0")).toBe(false);
    });

    it("ignores anything after major.minor.patch", () => {
        expect(isNewerVersion("2.0.0-beta.1", "1.9.4")).toBe(true);
    });

    it("is false when either version can't be parsed", () => {
        expect(isNewerVersion("latest", "1.9.4")).toBe(false);
        expect(isNewerVersion("2.0.0", "")).toBe(false);
    });
});
