import type { Plugin } from "vite";

/**
 * The prerender loads Video.js 10's stock skin with the player engine, and the skin builds its shadow
 * stylesheet with `CSSStyleSheet.replaceSync` as soon as it is imported. vite-ssg's jsdom has the class
 * but not that method, and its globals only exist once the server build starts, so the stub is installed
 * there: after jsdom, before the server bundle is imported. The prerender draws no player, so the sheet
 * can stay empty.
 */
export function ssgConstructableStyleSheets(): Plugin {
    return {
        name: "ssg-constructable-stylesheets",
        apply: "build",
        buildStart() {
            // Read off globalThis: this config is type-checked without the DOM's types.
            const sheet = (
                globalThis as {
                    CSSStyleSheet?: { prototype: { replaceSync?: (css: string) => void } };
                }
            ).CSSStyleSheet;
            if (sheet && typeof sheet.prototype.replaceSync !== "function") {
                sheet.prototype.replaceSync = function replaceSync(): void {};
            }
        },
    };
}
