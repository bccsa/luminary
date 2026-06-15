import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
// @ts-expect-error - JavaScript module without type declarations
import movePreloadScriptsToBody from "./src/assets/vite-plugins/movePreloadScriptsToBody.js";
import { buildTargetVirtuals } from "./vite-plugins/buildTargetVirtuals";

const env = loadEnv("", process.cwd());

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        buildTargetVirtuals(),
        visualizer({ open: false }), // Open visualiser when reviewing build bundle size
        vue(),
        viteStaticCopy({
            targets: [
                {
                    src: "src/analytics/service-worker.js",
                    dest: "./src/analytics/",
                },
            ],
        }),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["src/assets"],
            manifest: {
                name: env.VITE_APP_NAME,
                short_name: env.VITE_APP_NAME,
                icons: [
                    {
                        src: env.VITE_LOGO_FAVICON,
                        sizes: "192x192",
                        type: "image/png",
                    },
                ],
            },
            workbox: {
                // No image runtimeCaching: content images rely on the browser's native HTTP cache
                // (api serves them with `Cache-Control: ...immutable`). A service-worker image cache
                // can't run under Capacitor's WKWebView/Android WebView anyway. globPatterns keeps
                // only app-identity assets (favicon/logo/icons); bundled content images are left to
                // the browser HTTP cache too.
                globPatterns: ["**/*.{ico,png,svg}"],
            },
        }),
        movePreloadScriptsToBody(),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        port: 4174,
        strictPort: true,
    },
    build: {
        target: "es2015",
        sourcemap: true,
        minify: env.VITE_BYPASS_MINIFY !== "true",
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ["pinia"],
                    utils: ["lodash-es", "luxon"],
                },
            },
        },
    },
});
