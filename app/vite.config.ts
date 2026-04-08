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

const exec = util.promisify(child_process.exec);
const env = loadEnv("", process.cwd());

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        visualizer({ open: false }), // Open visualiser when reviewing build bundle size
        vue(),
        viteStaticCopy({
            targets: [
                {
                    src: "src/analytics/service-worker.js",
                    dest: "./analytics/",
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
        VitePWA({
            registerType: "autoUpdate",
            manifest: {
                name: env.VITE_APP_NAME || "Luminary",
                short_name: env.VITE_APP_NAME || "Luminary",
                description: "Watch, listen, and explore content offline",
                theme_color: "#0f172a",
                background_color: "#ffffff",
                display: "standalone",
                scope: "/",
                start_url: "/",
                orientation: "portrait-primary",
            },
            pwaAssets: {
                image: env.VITE_LOGO_FAVICON || "src/assets/favicon.png",
            },
            workbox: {
                // Precache the entire app shell: JS, CSS, HTML, fonts, and images
                globPatterns: ["**/*.{js,css,html,woff2,ico,png,webp,jpg,jpeg,svg}"],
                // Exclude Matomo analytics SW from precaching
                globIgnores: ["**/analytics/**"],
                // SPA navigation fallback — serves cached index.html for all routes
                navigateFallback: "index.html",
                navigateFallbackDenylist: [/^\/analytics\//],
                runtimeCaching: [
                    {
                        // External images — CacheFirst with expiration
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "external-images",
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                            expiration: {
                                maxEntries: 500,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                            },
                        },
                    },
                    {
                        // Auth endpoints — never cache
                        urlPattern: /^https:\/\/.*\.(auth0|authz)\.com\//i,
                        handler: "NetworkOnly",
                    },
                    {
                        // Matomo analytics — let the Matomo SW handle it
                        urlPattern: /matomo|analytics/i,
                        handler: "NetworkOnly",
                    },
                ],
                cleanupOutdatedCaches: true,
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
    preview: {
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
