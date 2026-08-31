import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BOOT_SPLASH_ID, stripBootSplash } from "./bootSplash";

const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const indexHtml = read("../index.html");

// The splash is spread across index.html, main.ts and the web build's HTML transform, with
// nothing at runtime that would fail loudly if one of the three drifted from the others.
describe("boot splash", () => {
    it("is present in index.html under the id main.ts removes", () => {
        expect(indexHtml).toContain(`id="${BOOT_SPLASH_ID}"`);
        expect(read("./main.ts")).toContain(`getElementById(BOOT_SPLASH_ID)`);
    });

    it("paints before the module entry, so it covers the whole boot", () => {
        expect(indexHtml.indexOf(BOOT_SPLASH_ID)).toBeLessThan(indexHtml.indexOf('type="module"'));
    });

    it("references the logo by a root-absolute path, which resolves at any route depth", () => {
        expect(indexHtml).toContain('src="/logo.svg"');
    });

    it("is stripped in full for the web build, leaving the rest of the page intact", () => {
        const stripped = stripBootSplash(indexHtml);

        expect(stripped).not.toMatch(/bootSplash|boot-splash|bs-slug|bs-track|bs-label/);
        expect(stripped).toContain('<div id="app"></div>');
        expect(stripped).toContain('type="module"');
    });
});
