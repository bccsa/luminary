import path from "node:path";
import os from "node:os";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
        await expect(
            resolveId.call({} as never, "virtual:share", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toContain("/build-time/plugins/share/index.ts");
    });

    it("uses external implementations and resolves their package imports from the app", async () => {
        vi.stubEnv("VITE_NATIVE_IMPL_DIR", "/tmp/luminary-native");
        const resolve = vi.fn().mockResolvedValue({ id: "/app/node_modules/vue/index.mjs" });
        const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));
        const context = { resolve };

        await expect(
            resolveId.call(context as never, "virtual:auth-flow", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toBe(path.join("/tmp/luminary-native", "auth-flow.ts"));
        await expect(
            resolveId.call(context as never, "virtual:app-update", undefined, {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toBe(path.join("/tmp/luminary-native", "app-update.ts"));
        await expect(
            resolveId.call(context as never, "vue", "/tmp/luminary-native/auth-flow.ts", {
                attributes: {},
                isEntry: false,
            }),
        ).resolves.toEqual({ id: "/app/node_modules/vue/index.mjs" });
        expect(resolve).toHaveBeenCalledWith("vue", expect.stringMatching(/\/src\/main\.ts$/), {
            skipSelf: true,
        });
    });

    describe("optional and required names with an implementation directory", () => {
        let implDir: string;
        const options = { attributes: {}, isEntry: false };

        beforeEach(() => {
            implDir = mkdtempSync(path.join(os.tmpdir(), "luminary-impl-"));
            vi.stubEnv("VITE_NATIVE_IMPL_DIR", implDir);
        });

        afterEach(() => {
            rmSync(implDir, { recursive: true, force: true });
        });

        it("resolves an optional name to the directory's file when it is there", async () => {
            writeFileSync(path.join(implDir, "downloads.ts"), "export {};\n");
            const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));

            await expect(
                resolveId.call({} as never, "virtual:downloads", undefined, options),
            ).resolves.toBe(path.join(implDir, "downloads.ts"));
        });

        it("falls back to the in-app entry for an optional name the directory lacks", async () => {
            const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));

            await expect(
                resolveId.call({} as never, "virtual:downloads", undefined, options),
            ).resolves.toBe("/app/src/build-time/plugins/downloads/index.ts");
        });

        it("resolves a required name to the directory's file when it is there", async () => {
            writeFileSync(path.join(implDir, "share.ts"), "export {};\n");
            const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));

            await expect(
                resolveId.call({} as never, "virtual:share", undefined, options),
            ).resolves.toBe(path.join(implDir, "share.ts"));
        });

        it("keeps a required name on the directory's missing file, so the build fails", async () => {
            const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));

            const resolved = await resolveId.call({} as never, "virtual:share", undefined, options);
            expect(resolved).toBe(path.join(implDir, "share.ts"));
            expect(existsSync(resolved as string)).toBe(false);
        });
    });

    describe("the optional app-promo name", () => {
        let implDir: string;
        const options = { attributes: {}, isEntry: false };
        const inApp = "/app/src/build-time/plugins/app-promo/index.ts";
        const resolve = (id: string) =>
            resolveIdHandler(buildTargetVirtuals("/app/src")).call(
                {} as never,
                id,
                undefined,
                options,
            );

        beforeEach(() => {
            implDir = mkdtempSync(path.join(os.tmpdir(), "luminary-impl-"));
            vi.stubEnv("VITE_NATIVE_IMPL_DIR", "");
            vi.stubEnv("VITE_WEB_IMPL_DIR", "");
        });

        afterEach(() => {
            rmSync(implDir, { recursive: true, force: true });
        });

        it("resolves to the native directory's file when it is there", async () => {
            vi.stubEnv("VITE_NATIVE_IMPL_DIR", implDir);
            writeFileSync(path.join(implDir, "app-promo.ts"), "export {};\n");

            await expect(resolve("virtual:app-promo")).resolves.toBe(
                path.join(implDir, "app-promo.ts"),
            );
        });

        it("falls back to the in-app entry when the native directory lacks it", async () => {
            vi.stubEnv("VITE_NATIVE_IMPL_DIR", implDir);

            await expect(resolve("virtual:app-promo")).resolves.toBe(inApp);
        });

        it("resolves to the web directory's file when it is there", async () => {
            vi.stubEnv("VITE_WEB_IMPL_DIR", implDir);
            writeFileSync(path.join(implDir, "app-promo.ts"), "export {};\n");

            await expect(resolve("virtual:app-promo")).resolves.toBe(
                path.join(implDir, "app-promo.ts"),
            );
        });

        it("resolves to the in-app entry with the web directory unset or lacking the file", async () => {
            await expect(resolve("virtual:app-promo")).resolves.toBe(inApp);

            vi.stubEnv("VITE_WEB_IMPL_DIR", implDir);
            await expect(resolve("virtual:app-promo")).resolves.toBe(inApp);
        });

        it("keeps required names on their in-app entries with a web directory", async () => {
            vi.stubEnv("VITE_WEB_IMPL_DIR", implDir);
            writeFileSync(path.join(implDir, "share.ts"), "export {};\n");

            await expect(resolve("virtual:share")).resolves.toBe(
                "/app/src/build-time/plugins/share/index.ts",
            );
        });

        it("resolves bare package imports in a web implementation from the app", async () => {
            vi.stubEnv("VITE_WEB_IMPL_DIR", implDir);
            const resolver = vi.fn().mockResolvedValue({ id: "/app/node_modules/vue/index.mjs" });
            const resolveId = resolveIdHandler(buildTargetVirtuals("/app/src"));

            await expect(
                resolveId.call(
                    { resolve: resolver } as never,
                    "vue",
                    path.join(implDir, "app-promo.ts"),
                    options,
                ),
            ).resolves.toEqual({ id: "/app/node_modules/vue/index.mjs" });
        });

        it("ignores the web directory in a packaged-app build", async () => {
            const webDir = mkdtempSync(path.join(os.tmpdir(), "luminary-web-"));
            try {
                writeFileSync(path.join(webDir, "app-promo.ts"), "export {};\n");
                vi.stubEnv("VITE_NATIVE_IMPL_DIR", implDir);
                vi.stubEnv("VITE_WEB_IMPL_DIR", webDir);

                await expect(resolve("virtual:app-promo")).resolves.toBe(inApp);
            } finally {
                rmSync(webDir, { recursive: true, force: true });
            }
        });
    });
});
