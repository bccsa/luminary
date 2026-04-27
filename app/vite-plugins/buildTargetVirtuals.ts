import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Resolves `virtual:media-player` to `src/build-time-plugins/media-player/index.ts`. */
export function buildTargetVirtuals(): Plugin {
    const root = fileURLToPath(new URL("../src", import.meta.url));

    return {
        name: "build-target-virtuals",
        resolveId(id) {
            if (id === "virtual:media-player") {
                return `${root}/build-time-plugins/media-player/index.ts`;
            }
        },
    };
}
