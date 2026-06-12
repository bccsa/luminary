import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/**
 * Central map of build-target virtual modules.
 * Add new `virtual:*` entries here when introducing another build-swapped service.
 */
export function buildTargetVirtuals(): Plugin {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    const virtualTargets: Record<string, string> = {
        "virtual:demo-banner": `${root}/build-time/plugins/demo-banner/index.ts`,
    };

    return {
        name: "build-target-virtuals",
        resolveId(id) {
            return virtualTargets[id];
        },
    };
}
