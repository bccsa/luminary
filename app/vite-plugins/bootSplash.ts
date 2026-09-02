import type { Plugin } from "vite";
import {
    bootSplashMarkup,
    bootSplashPrePaintScript,
    bootSplashReloadScript,
    bootSplashStyle,
} from "../src/bootSplash";

/**
 * Injects the startup splash into `index.html`. Wired into `vite.config.ts` only — the web build
 * ships already-rendered HTML, so it has no blank boot to cover and would otherwise bake a
 * full-screen overlay into every static page.
 */
export function bootSplash(configuredLogo?: string): Plugin {
    return {
        name: "boot-splash",
        transformIndexHtml: {
            order: "pre",
            handler: (html) => ({
                // After `#app`, so the splash is a sibling the app renders behind rather than
                // content `app.mount()` would discard.
                html: html.replace(
                    '<div id="app"></div>',
                    `<div id="app"></div>\n        ${bootSplashMarkup(configuredLogo)}`,
                ),
                tags: [
                    { tag: "style", injectTo: "head" as const, children: bootSplashStyle() },
                    {
                        tag: "script",
                        injectTo: "head" as const,
                        children: bootSplashPrePaintScript(),
                    },
                    {
                        tag: "script",
                        injectTo: "body" as const,
                        children: bootSplashReloadScript(),
                    },
                ],
            }),
        },
    };
}
