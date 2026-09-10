import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Central map of build-target virtual modules.
 * Add new `virtual:*` entries here when introducing another build-swapped service.
 *
 * `VITE_NATIVE_IMPL_DIR` points a packaged-app build at an external directory
 * supplying `<name>.ts` implementations for the platform-swappable services,
 * so the app source stays free of packaged-app specifics.
 */
export function buildTargetVirtuals(
    root = fileURLToPath(new URL("../src", import.meta.url)),
): Plugin {
    const virtualTargets: Record<string, string> = {
        "virtual:demo-banner": `${root}/build-time/plugins/demo-banner/index.ts`,
        "virtual:platform-chrome": `${root}/build-time/plugins/platform-chrome/index.ts`,
        "virtual:auth-flow": `${root}/build-time/plugins/auth-flow/index.ts`,
        "virtual:app-lifecycle": `${root}/build-time/plugins/app-lifecycle/index.ts`,
    };
    const platformSwappable = new Set(["platform-chrome", "auth-flow", "app-lifecycle"]);
    const nativeImplDir = process.env.VITE_NATIVE_IMPL_DIR
        ? path.resolve(process.env.VITE_NATIVE_IMPL_DIR)
        : undefined;

    return {
        name: "build-target-virtuals",
        async resolveId(id, importer) {
            if (nativeImplDir && id.startsWith("virtual:")) {
                const name = id.slice("virtual:".length);
                if (platformSwappable.has(name)) return path.join(nativeImplDir, `${name}.ts`);
            }
            // Bare package imports in external implementation files resolve
            // against the app's own dependency tree, not their on-disk location.
            if (
                nativeImplDir &&
                importer?.startsWith(nativeImplDir) &&
                !id.startsWith(".") &&
                !id.startsWith("virtual:") &&
                !path.isAbsolute(id)
            ) {
                const resolved = await this.resolve(id, path.join(root, "main.ts"), {
                    skipSelf: true,
                });
                if (resolved) return resolved;
            }
            return virtualTargets[id];
        },
    };
}
