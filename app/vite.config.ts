import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";
import util from "util";
import child_process from "child_process";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";

const exec = util.promisify(child_process.exec);
const env = loadEnv("", process.cwd());

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        VitePWA({
            registerType: "autoUpdate",
            workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff2}"],
                navigateFallback: "index.html",
                runtimeCaching: [
                    // Cache navigations (HTML) so the app shell works offline
                    {
                        urlPattern: ({ request }) => request.mode === "navigate",
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "pages",
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Cache JS, CSS, and workers
                    {
                        urlPattern: ({ request }) =>
                            request.destination === "script" ||
                            request.destination === "style" ||
                            request.destination === "worker",
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "assets",
                            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Cache images
                    {
                        urlPattern: ({ request }) => request.destination === "image",
                        handler: "CacheFirst",
                        options: {
                            cacheName: "images",
                            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Cache same-origin JSON/API GET requests
                    {
                        urlPattern: ({ request, url }) =>
                            request.method === "GET" &&
                            (request.destination === "" || request.destination === "document") &&
                            request.mode === "same-origin" &&
                            url.pathname.startsWith("/api/"),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "api",
                            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Cache cross-origin requests (e.g., CDN images)
                    {
                        urlPattern: ({ url }) => url.origin !== "same-origin",
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "cross-origin",
                            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
            devOptions: {
                enabled: true,
                navigateFallback: "index.html",
            },
        }),
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
        // Load plugins
        {
            name: "Load Plugins For Build",
            async buildStart() {
                // load .env file
                process.env = { ...process.env, ...loadEnv("", process.cwd()) };
                const pluginPath = process.env.VITE_PLUGIN_PATH;

                if (!pluginPath) return;
                // copy plugins into plugins folder
                try {
                    await exec(`cp -R ${pluginPath}/* ./src/plugins`);
                } catch (err: any) {
                    console.log(err.message);
                }
            },
        },
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
