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

        await expect(resolveId.call({} as never, "virtual:auth-flow", undefined, {
            attributes: {},
            isEntry: false,
        })).resolves.toContain(
            "/build-time/plugins/auth-flow/index.ts",
        );
        await expect(resolveId.call({} as never, "virtual:platform-chrome", undefined, {
            attributes: {},
            isEntry: false,
        })).resolves.toContain(
            "/build-time/plugins/platform-chrome/index.ts",
        );
        await expect(resolveId.call({} as never, "virtual:app-lifecycle", undefined, {
            attributes: {},
            isEntry: false,
        })).resolves.toContain(
            "/build-time/plugins/app-lifecycle/index.ts",
        );
        await expect(resolveId.call({} as never, "virtual:screen-wake", undefined, {
            attributes: {},
            isEntry: false,
        })).resolves.toContain(
            "/build-time/plugins/screen-wake/index.ts",
        );
    });

    it("uses external implementations and resolves their package imports from the app", async () => {
        vi.stubEnv("VITE_NATIVE_IMPL_DIR", "/tmp/luminary-native");
        const resolve = vi.fn().mockResolvedValue({ id: "/app/node_modules/vue/index.mjs" });
        const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));
        const context = { resolve };

        await expect(resolveId.call(context as never, "virtual:auth-flow", undefined, {
            attributes: {},
            isEntry: false,
        })).resolves.toBe(
            path.join("/tmp/luminary-native", "auth-flow.ts"),
        );
        await expect(
            resolveId.call(context as never, "vue", "/tmp/luminary-native/auth-flow.ts", {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toEqual({ id: "/app/node_modules/vue/index.mjs" });
        expect(resolve).toHaveBeenCalledWith(
            "vue",
            expect.stringMatching(/\/src\/main\.ts$/),
            { skipSelf: true },
        );
    });
});
