import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    BOOT_SPLASH_ID,
    BOOT_SPLASH_OFF_CLASS,
    DEFAULT_BOOT_LOGO,
    bootSplashMarkup,
    bootSplashPrePaintScript,
    bootSplashStyle,
    resolveBootLogo,
} from "./bootSplash";

const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

// The splash is spread across this module, the Vite plugin that injects it, and main.ts's
// removal, with nothing at runtime that would fail loudly if one drifted from the others.
describe("boot splash", () => {
    it("is injected by the SPA build only, never the web build", () => {
        expect(read("../vite.config.ts")).toContain("bootSplash(env.VITE_LOGO)");
        expect(read("../vite.config.web.ts")).not.toContain("bootSplash");
        // Nothing inline in the template, so the web build cannot inherit it by accident.
        expect(read("../index.html")).not.toContain(BOOT_SPLASH_ID);
    });

    it("uses the id main.ts removes once the app has rendered", () => {
        expect(bootSplashMarkup()).toContain(`id="${BOOT_SPLASH_ID}"`);
        expect(read("./main.ts")).toContain("getElementById(BOOT_SPLASH_ID)?.remove()");
    });

    it("switches to an error panel on the render state a failed startup sets", () => {
        const style = bootSplashStyle();

        expect(style).toContain(
            `html[data-render-state="error"] #${BOOT_SPLASH_ID} .boot-splash-loading { display: none; }`,
        );
        expect(style).toContain(
            `html[data-render-state="error"] #${BOOT_SPLASH_ID} .boot-splash-error { display: flex; }`,
        );
        expect(bootSplashMarkup()).toContain('id="boot-splash-reload"');
        // markAppError() is what sets that attribute, and it must stay on the failure path.
        expect(read("./main.ts")).toContain("markAppError()");
    });

    it("honours the ?nosplash opt-out that isAppLoading also honours", () => {
        expect(bootSplashPrePaintScript()).toContain('has("nosplash")');
        expect(bootSplashPrePaintScript()).toContain(BOOT_SPLASH_OFF_CLASS);
        expect(bootSplashStyle()).toContain(
            `html.${BOOT_SPLASH_OFF_CLASS} #${BOOT_SPLASH_ID} { display: none; }`,
        );
        expect(read("./globalConfig.ts")).toContain('has("nosplash")');
    });

    it("resolves the theme before paint, so an explicit choice beats the OS preference", () => {
        const script = bootSplashPrePaintScript();

        expect(script).toContain('theme === "dark"');
        expect(script).toContain('theme !== "light"');
        expect(script).toContain("prefers-color-scheme: dark");
        expect(bootSplashStyle()).toContain(`html.dark #${BOOT_SPLASH_ID}`);
    });

    it("keeps a configured logo only when the browser can resolve it from any route", () => {
        expect(resolveBootLogo("https://cdn.example.org/brand.svg")).toBe(
            "https://cdn.example.org/brand.svg",
        );
        expect(resolveBootLogo("//cdn.example.org/brand.svg")).toBe("//cdn.example.org/brand.svg");
        expect(resolveBootLogo("/brand.svg")).toBe("/brand.svg");
        // The .env.example default: relative to the source tree, and never emitted by the build.
        expect(resolveBootLogo("../src/assets/logo.svg")).toBe(DEFAULT_BOOT_LOGO);
        expect(resolveBootLogo(undefined)).toBe(DEFAULT_BOOT_LOGO);
    });

    it("stays legible and still, for the readers who need it", () => {
        const style = bootSplashStyle();

        // Light-mode text at #d4d4d8 on white is 1.48:1 — below the threshold of perception.
        expect(style).toContain("--boot-splash-fg: #71717a;");
        expect(style).toContain("@media (prefers-reduced-motion: reduce)");
        expect(bootSplashMarkup()).toContain('role="status"');
    });
});
