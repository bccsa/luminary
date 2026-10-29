import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Plugin } from "vite";
import { buildTargetVirtuals } from "./buildTargetVirtuals";

function resolveIdHandler(plugin: Plugin) {
    const { resolveId } = plugin;
    if (!resolveId) throw new Error("Expected buildTargetVirtuals to provide resolveId");
    return typeof resolveId === "function" ? resolveId : resolveId.handler;
}

describe("buildTargetVirtuals", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("resolves browser implementations for each platform service", async () => {
        const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));

        await expect(
            resolveId.call({} as never, "virtual:auth-flow", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toContain("/build-time/plugins/auth-flow/index.ts");
        await expect(
            resolveId.call({} as never, "virtual:platform-chrome", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toContain("/build-time/plugins/platform-chrome/index.ts");
        await expect(
            resolveId.call({} as never, "virtual:app-lifecycle", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toContain("/build-time/plugins/app-lifecycle/index.ts");
        await expect(
            resolveId.call({} as never, "virtual:screen-wake", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toContain("/build-time/plugins/screen-wake/index.ts");
        await expect(
            resolveId.call({} as never, "virtual:app-update", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toContain("/build-time/plugins/app-update/index.ts");
    });

    it("uses external implementations and resolves their package imports from the app", async () => {
        const nativeDir = fs.mkdtempSync(path.join(os.tmpdir(), "luminary-native-"));
        fs.writeFileSync(path.join(nativeDir, "auth-flow.ts"), "export default {};\n");
        fs.writeFileSync(path.join(nativeDir, "app-update.ts"), "export default {};\n");

        vi.stubEnv("VITE_NATIVE_IMPL_DIR", nativeDir);
        const resolve = vi.fn().mockResolvedValue({ id: "/app/node_modules/vue/index.mjs" });
        const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));
        const context = { resolve };

        await expect(
            resolveId.call(context as never, "virtual:auth-flow", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toBe(path.join(nativeDir, "auth-flow.ts"));
        await expect(
            resolveId.call(context as never, "virtual:app-update", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toBe(path.join(nativeDir, "app-update.ts"));
        await expect(
            resolveId.call(context as never, "vue", path.join(nativeDir, "auth-flow.ts"), {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toEqual({ id: "/app/node_modules/vue/index.mjs" });
        expect(resolve).toHaveBeenCalledWith("vue", expect.stringMatching(/\/src\/main\.ts$/), {
            skipSelf: true,
        });
    });

    it("falls back to the repo implementation when a configured native override file is missing", async () => {
        const missingNativeDir = path.join(os.tmpdir(), "luminary-native-missing");
        vi.stubEnv("VITE_NATIVE_IMPL_DIR", missingNativeDir);
        const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));

        await expect(
            resolveId.call({} as never, "virtual:video-player", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toContain("/build-time/plugins/video-player/index.ts");
    });
});
