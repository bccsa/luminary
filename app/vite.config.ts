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
            injectRegister: "inline",
            manifest: {
                name: "Luminary App",
                short_name: "Luminary",
                start_url: "/",
                display: "standalone",
                background_color: "#ffffff",
                theme_color: "#1e293b",
                icons: [
                    // NOTE: Chrome/Brave prefer PNG icons; ensure these files exist in /public/icons
                    // If not available yet, keep SVGs temporarily but add PNGs soon for install prompts
                    { src: "/logo.svg", sizes: "192x192", type: "image/svg+xml" },
                    { src: "/logo.svg", sizes: "512x512", type: "image/svg+xml" },
                ],
            },
            workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff2}"],
                navigateFallback: "index.html",
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                    // Offline-first app shell: HTML navigations
                    {
                        urlPattern: ({ request }) => request.mode === "navigate",
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "pages",
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // JS/CSS/workers/fonts
                    {
                        urlPattern: ({ request }) =>
                            request.destination === "script" ||
                            request.destination === "style" ||
                            request.destination === "worker" ||
                            request.destination === "font",
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "assets",
                            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Images
                    {
                        urlPattern: ({ request }) => request.destination === "image",
                        handler: "CacheFirst",
                        options: {
                            cacheName: "images",
                            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Same-origin API (GET only)
                    {
                        urlPattern: ({ url, request }) =>
                            request.method === "GET" && url.pathname.startsWith("/api/"),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "api",
                            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Optionally add cross-origin caching here if needed (avoid Node globals in config)
                ],
                clientsClaim: true,
                skipWaiting: true,
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
                {
                    src: "src/assets/fallbackImages/*",
                    dest: "assets/fallbackImages/",
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
