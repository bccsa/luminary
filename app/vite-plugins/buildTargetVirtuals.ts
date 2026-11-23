import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Central map of build-target virtual modules.
 * Add new `virtual:*` entries here when introducing another build-swapped service.
 *
 * `VITE_NATIVE_IMPL_DIR` points a packaged-app build at an external directory
 * supplying `<name>.ts` implementations for the platform-swappable services,
 * so the app source stays free of packaged-app specifics. A required name must
 * have its file there; an optional one falls back to its in-app entry when the
 * directory has none.
 *
 * `VITE_WEB_IMPL_DIR` does the same for the web builds, for optional names only:
 * required names keep their in-app entries there. A packaged-app build ignores it.
 */
export function buildTargetVirtuals(
    root = fileURLToPath(new URL("../src", import.meta.url)),
): Plugin {
    const virtualTargets: Record<string, string> = {
        "virtual:demo-banner": `${root}/build-time/plugins/demo-banner/index.ts`,
        "virtual:platform-chrome": `${root}/build-time/plugins/platform-chrome/index.ts`,
        "virtual:auth-flow": `${root}/build-time/plugins/auth-flow/index.ts`,
        "virtual:app-lifecycle": `${root}/build-time/plugins/app-lifecycle/index.ts`,
        "virtual:screen-wake": `${root}/build-time/plugins/screen-wake/index.ts`,
        "virtual:video-player": `${root}/build-time/plugins/video-player/index.ts`,
        "virtual:app-update": `${root}/build-time/plugins/app-update/index.ts`,
        "virtual:share": `${root}/build-time/plugins/share/index.ts`,
        "virtual:downloads": `${root}/build-time/plugins/downloads/index.ts`,
        "virtual:app-promo": `${root}/build-time/plugins/app-promo/index.ts`,
    };
    const platformSwappable = new Set([
        "platform-chrome",
        "auth-flow",
        "app-lifecycle",
        "screen-wake",
        "video-player",
        "app-update",
        "share",
    ]);
    // A target that predates one of these, or has no use for it, simply leaves its file out.
    const optionalSwappable = new Set(["downloads", "app-promo"]);
    const nativeImplDir = process.env.VITE_NATIVE_IMPL_DIR
        ? path.resolve(process.env.VITE_NATIVE_IMPL_DIR)
        : undefined;
    const webImplDir =
        !nativeImplDir && process.env.VITE_WEB_IMPL_DIR
            ? path.resolve(process.env.VITE_WEB_IMPL_DIR)
            : undefined;
    const implDir = nativeImplDir ?? webImplDir;

    return {
        name: "build-target-virtuals",
        async resolveId(id, importer) {
            if (implDir && id.startsWith("virtual:")) {
                const name = id.slice("virtual:".length);
                const implementation = path.join(implDir, `${name}.ts`);
                if (nativeImplDir && platformSwappable.has(name)) return implementation;
                if (optionalSwappable.has(name) && existsSync(implementation)) {
                    return implementation;
                }
            }
            // Bare package imports in external implementation files resolve
            // against the app's own dependency tree, not their on-disk location.
            if (
                implDir &&
                importer?.startsWith(implDir) &&
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
