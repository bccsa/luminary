import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteStaticCopy } from "vite-plugin-static-copy";
import util from "util";
import child_process from "child_process";
import { visualizer } from "rollup-plugin-visualizer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

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
        {
            name: "emit-version-json",
            apply: "build",
            closeBundle() {
                try {
                    const outDir = path.resolve(__dirname, "dist");
                    const candidatePaths = [
                        path.join(outDir, "manifest.json"),
                        path.join(outDir, ".vite", "manifest.json"),
                    ];
                    const manifestPath = candidatePaths.find((p) => fs.existsSync(p));
                    let manifestRaw = "";
                    if (manifestPath) {
                        manifestRaw = fs.readFileSync(manifestPath, "utf-8");
                    }
                    let commit = "unknown";
                    try {
                        commit = execSync("git rev-parse --short HEAD", {
                            stdio: ["ignore", "pipe", "ignore"],
                        })
                            .toString()
                            .trim();
                    } catch {
                        // ignore git errors (e.g., not a git repo)
                    }
                    const buildTime = new Date().toISOString();
                    const manifestHash = manifestRaw
                        ? crypto.createHash("sha256").update(manifestRaw).digest("hex").slice(0, 16)
                        : "nomanifest";
                    // Combine manifest hash + commit + build time for a unique version hash per build
                    const versionHash = crypto
                        .createHash("sha256")
                        .update(manifestHash + commit + buildTime)
                        .digest("hex")
                        .slice(0, 16);
                    const payload = {
                        hash: versionHash,
                        manifestHash,
                        commit,
                        buildTime,
                        manifestPresent: !!manifestPath,
                    };
                    fs.writeFileSync(
                        path.join(outDir, "version.json"),
                        JSON.stringify(payload, null, 2),
                        "utf-8",
                    );
                } catch (e) {
                    console.error(
                        "Failed to emit version.json",
                        e instanceof Error ? e.message : e,
                    );
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
        manifest: true,
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
