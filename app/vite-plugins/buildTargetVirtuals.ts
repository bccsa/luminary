import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import type { Plugin } from "vite";

/**
 * Resolves `virtual:media-player` to exactly one implementation
 * (`/plugins/media-player/{BUILD_TARGET}/index.ts`) so Rollup only bundles the active target.
 */
export function buildTargetVirtuals(): Plugin {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    let buildTarget = "web";

    return {
        name: "build-target-virtuals",
        config(_userConfig, env) {
            const loaded = loadEnv(env.mode, process.cwd(), "");
            buildTarget = loaded.BUILD_TARGET || "web";
        },
        resolveId(id) {
            if (id === "virtual:media-player") {
                return `${root}/plugins/media-player/${buildTarget}/index.ts`;
            }
        },
    };
}
