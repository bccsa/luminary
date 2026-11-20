import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { isVideoJsElement, VIDEOJS_PACKAGES } from "./vite.config";

/**
 * Dev server for the player's test harness in `player-demo/`, which the player's browser specs drive. It
 * compiles the player from source, as the app does: Video.js 10 tags are custom elements, and one Video.js
 * is shared between the player UI and its engine.
 */
export default defineConfig({
    root: fileURLToPath(new URL("./player-demo", import.meta.url)),
    plugins: [vue({ template: { compilerOptions: { isCustomElement: isVideoJsElement } } })],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
        dedupe: ["vue", ...VIDEOJS_PACKAGES],
    },
    server: { host: "127.0.0.1", port: 5182, strictPort: true },
});
