import { describe, it, expect, afterEach } from "vitest";
import { isPrerender } from "./isPrerender";

describe("isPrerender", () => {
    afterEach(() => {
        (import.meta.env as { SSR: boolean }).SSR = false;
    });

    it("reflects import.meta.env.SSR", () => {
        expect(isPrerender()).toBe(false);

        (import.meta.env as { SSR: boolean }).SSR = true;
        expect(isPrerender()).toBe(true);
    });
});
