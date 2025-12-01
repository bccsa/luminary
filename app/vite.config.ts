import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";
import util from "util";
import child_process from "child_process";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";

const exec = util.promisify(child_process.exec);
const env = loadEnv("", process.cwd());

/**
 * Vite plugin that moves JavaScript preload script tags from <head> to <body>
 * to improve SSG (Static Site Generation) performance.
 * This defers script preloading until the body is parsed, improving initial page load.
 */
function movePreloadScriptsToBody(): Plugin {
    return {
        name: "move-preload-scripts-to-body",
        apply: "build", // Only apply during build, not dev
        transformIndexHtml: {
            enforce: "post", // Run after other HTML transformations
            transform(html) {
                // Match all JavaScript-related tags that should be moved to body:
                // 1. Preload script tags (modulepreload and preload with as="script")
                // 2. Script tags with type="module" (handles both self-closing and with content)
                const preloadScriptRegex =
                    /<link[^>]*(?:rel\s*=\s*["']modulepreload["']|(?:rel\s*=\s*["']preload["'][^>]*as\s*=\s*["']script["']|as\s*=\s*["']script["'][^>]*rel\s*=\s*["']preload["']))[^>]*\/?>/gi;
                const moduleScriptRegex =
                    /<script[^>]*type\s*=\s*["']module["'][^>]*(?:\/>|>.*?<\/script>)/gi;

                const scriptsToMove: string[] = [];
                let match;

                // Reset regex lastIndex to avoid issues with multiple calls
                preloadScriptRegex.lastIndex = 0;
                moduleScriptRegex.lastIndex = 0;

                // Find all preload script tags
                while ((match = preloadScriptRegex.exec(html)) !== null) {
                    if (match[0]) {
                        scriptsToMove.push(match[0]);
                    }
                }

                // Find all module script tags
                while ((match = moduleScriptRegex.exec(html)) !== null) {
                    if (match[0]) {
                        scriptsToMove.push(match[0]);
                    }
                }

                if (scriptsToMove.length === 0) {
                    return html;
                }

                // Remove scripts from the HTML
                let modifiedHtml = html;
                scriptsToMove.forEach((script) => {
                    // Escape special regex characters
                    const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    // Remove the tag with optional whitespace/newlines around it
                    const regex = new RegExp(`\\s*${escaped}\\s*`, "g");
                    modifiedHtml = modifiedHtml.replace(regex, "");
                });

                // Add scripts to body (before closing </body> tag)
                // Match the indentation of the body content (typically 8 spaces)
                const bodyMatch = modifiedHtml.match(/(\s*)<\/body>/i);
                if (bodyMatch) {
                    const bodyIndent = bodyMatch[1] || "        ";
                    // Use the same indentation as body content
                    const scriptsToAdd = scriptsToMove
                        .map((script) => `${bodyIndent}${script.trim()}`)
                        .join("\n");
                    modifiedHtml = modifiedHtml.replace(
                        /(\s*)<\/body>/i,
                        `\n${scriptsToAdd}\n$1</body>`,
                    );
                } else {
                    // Fallback: append before </html> if no body tag found
                    const scriptsToAdd = scriptsToMove
                        .map((script) => `        ${script.trim()}`)
                        .join("\n");
                    modifiedHtml = modifiedHtml.replace(
                        /(\s*)<\/html>/i,
                        `\n${scriptsToAdd}\n$1</html>`,
                    );
                }

                return modifiedHtml;
            },
        },
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
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
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["src/assets"],
            workbox: {
                globPatterns: ["**/*.{ico,png,webp,jpg,jpeg,svg}"],
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
