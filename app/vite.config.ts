import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";
import util from "util";
import child_process from "child_process";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
// @ts-expect-error - JavaScript module without type declarations
import movePreloadScriptsToBody from "./src/assets/vite-plugins/movePreloadScriptsToBody.js";
import { buildTargetVirtuals } from "./vite-plugins/buildTargetVirtuals";

const exec = util.promisify(child_process.exec);
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
        {
            name: "Load Plugins For Build",
            async buildStart() {
                process.env = { ...process.env, ...loadEnv("", process.cwd()) };
                const pluginPath = process.env.VITE_PLUGIN_PATH;

                if (!pluginPath) return;
                try {
                    await exec(`cp -R ${pluginPath}/* ./src/plugins`);
                } catch (err: unknown) {
                    console.log(err instanceof Error ? err.message : err);
                }
            },
        },
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["src/assets"],
            workbox: {
                globPatterns: ["**/*.{ico,png,webp,jpg,jpeg,svg}"],
                runtimeCaching: [
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "external-images",
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                    {
                        urlPattern: ({ request }) => request.destination === "image",
                        handler: "CacheFirst",
                        options: {
                            cacheName: "external-images",
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                ],
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
