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
        visualizer({ open: false }),
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
                } catch (err: any) {
                    console.log(err.message);
                }
            },
        },
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["src/assets"],
            workbox: {
                globPatterns: ["**/*.{ico,png,webp,jpg,jpeg,svg}"],
            },
        }),

        // Force scripts to bottom of <body>
        // Fixes SSG crawling + makes real users see content instantly
        {
            name: "force-scripts-to-body-end",
            apply: "build", // only run during production build
            enforce: "post",
            transformIndexHtml: {
                order: "post",
                handler(html: string) {
                    // Skip in development – dev server already has script at bottom
                    if (process.env.NODE_ENV !== "production") return html;

                    // Match module scripts and modulepreload links
                    const scriptRegex = /<script\b[^>]*type=["']module["'][^>]*><\/script>/g;
                    const preloadRegex = /<link\b[^>]*rel=["']modulepreload["'][^>]*>/g;

                    const scripts: string[] = [];
                    const preloads: string[] = [];

                    let cleaned = html
                        .replace(scriptRegex, (match) => {
                            scripts.push(match);
                            return "<!-- MODULE_SCRIPT_PLACEHOLDER -->";
                        })
                        .replace(preloadRegex, (match) => {
                            preloads.push(match);
                            return "<!-- MODULE_PRELOAD_PLACEHOLDER -->";
                        });

                    // Put preloads back in <head> (they belong there)
                    // Put actual executing scripts right before </body>
                    cleaned = cleaned
                        .replace(/<!-- MODULE_PRELOAD_PLACEHOLDER -->/g, preloads.join("\n    "))
                        .replace(/<\/body>/, `${scripts.map((s) => `  ${s}`).join("\n")}\n</body>`);

                    return cleaned;
                },
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
