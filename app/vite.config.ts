import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
// @ts-expect-error - JavaScript module without type declarations
import movePreloadScriptsToBody from "./src/assets/vite-plugins/movePreloadScriptsToBody.js";
import { buildTargetVirtuals } from "./vite-plugins/buildTargetVirtuals";

const env = loadEnv("", process.cwd());

// The deployed version manifest and the code that reads it must be created from
// exactly the same ISO timestamp.
const buildId = new Date().toISOString();

function versionManifest(): Plugin {
    return {
        name: "version-manifest",
        generateBundle() {
            this.emitFile({
                type: "asset",
                fileName: "version.json",
                source: JSON.stringify({ buildId }),
            });
        },
    };
}

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
        // Keep the installable PWA manifest and offline worker, but do not let
        // Workbox decide when to reload an active client. Deploy detection and
        // the user-facing reload prompt are handled by versionManifest below.
        VitePWA({
            registerType: "prompt",
            includeAssets: ["src/assets"],
            manifest: {
                name: env.VITE_APP_NAME,
                short_name: env.VITE_APP_NAME,
                theme_color: "#ffffff",
                background_color: "#ffffff",
                icons: [
                    {
                        src: env.VITE_LOGO_FAVICON,
                        sizes: "192x192",
                        type: "image/png",
                    },
                ],
            },
            workbox: {
                // No image runtimeCaching: content images rely on browser HTTP
                // caching. Only identity assets are precached by the PWA worker.
                globPatterns: ["**/*.{ico,png,svg}"],
            },
        }),
        versionManifest(),
        movePreloadScriptsToBody(),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // Consume luminary-shared straight from source for HMR (no rebuild/re-install).
            // `dist` is only used for npm-publish and TypeScript type resolution.
            "luminary-shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
        },
        // shared/src imports these; dedupe so app + shared share one instance.
        dedupe: ["vue", "dexie", "@vueuse/core"],
    },
    define: {
        __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    server: {
        port: 4174,
        strictPort: true,
        // Allow Vite to serve the sibling shared/ source (outside this package root).
        fs: { allow: [".."] },
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
