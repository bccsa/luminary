import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

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
        vue(),
        versionManifest(),
        VitePWA({
            registerType: "prompt",
            manifest: {
                name: env.VITE_APP_NAME,
                short_name: env.VITE_APP_NAME,
                theme_color: "#ffffff",
                background_color: "#ffffff",
                icons: [
                    {
                        src: "/pwa-icon-192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{ico,png,svg}"],
                navigateFallback: null,
            },
        }),
    ],
    define: {
        __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // Consume luminary-shared straight from source for HMR (no rebuild/re-install).
            // `dist` is only used for npm-publish and TypeScript type resolution.
            "luminary-shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
        },
        // shared/src imports these; dedupe so cms + shared share one instance.
        dedupe: ["vue", "dexie", "@vueuse/core"],
    },
    server: {
        port: 4175,
        strictPort: true,
        // Allow Vite to serve the sibling shared/ source (outside this package root).
        fs: { allow: [".."] },
    },
    build: {
        sourcemap: true,
        minify: true,
    },
});
