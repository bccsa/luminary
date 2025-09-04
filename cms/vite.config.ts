import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

// https://vitejs.dev/config/
export default defineConfig(() => {
    return {
        plugins: [
            vue(),
            // Plugin to write a simple version.json with a content hash based on manifest contents
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
                        if (!manifestPath) return;
                        const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
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
                        const manifestHash = crypto
                            .createHash("sha256")
                            .update(manifestRaw)
                            .digest("hex")
                            .slice(0, 16);
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
                        };
                        fs.writeFileSync(
                            path.join(outDir, "version.json"),
                            JSON.stringify(payload, null, 2),
                            "utf-8",
                        );
                    } catch (e) {
                        console.error("Failed to emit version.json", e);
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
            port: 4175,
            strictPort: true,
        },
        build: {
            sourcemap: true,
            minify: true,
            manifest: true, // generate manifest.json
        },
    };
});
