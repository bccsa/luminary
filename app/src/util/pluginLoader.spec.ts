import { describe, it, expect, vi, beforeEach } from "vitest";

describe("pluginLoader", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("loadPlugins", () => {
        it("returns early when VITE_PLUGINS is not set", async () => {
            vi.stubEnv("VITE_PLUGINS", "");
            const { loadPlugins } = await import("./pluginLoader");
            const consoleSpy = vi.spyOn(console, "error");

            await loadPlugins();

            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it("handles invalid JSON in VITE_PLUGINS gracefully", async () => {
            vi.stubEnv("VITE_PLUGINS", "not-valid-json");

            vi.resetModules();
            const { loadPlugins } = await import("./pluginLoader");
            const consoleSpy = vi.spyOn(console, "error");

            await loadPlugins();

            expect(consoleSpy).toHaveBeenCalled();
        });

        it("loads multiple plugins from VITE_PLUGINS", async () => {
            vi.stubEnv("VITE_PLUGINS", '["examplePlugin"]');
            vi.resetModules();
            const { loadPlugins } = await import("./pluginLoader");

            await loadPlugins();
            // Verifying no errors thrown when loading valid plugins
        });
    });

    describe("dynamicLoadPlugin", () => {
        it("returns undefined for empty string", async () => {
            const { dynamicLoadPlugin } = await import("./pluginLoader");

            const result = await dynamicLoadPlugin("");
            expect(result).toBeUndefined();
        });

        it("logs error when plugin module has no matching constructor", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            const { dynamicLoadPlugin } = await import("./pluginLoader");

            // Import of a non-existent plugin will throw
            const result = await dynamicLoadPlugin("nonExistentPlugin");

            expect(consoleSpy).toHaveBeenCalled();
            expect(result).toBeUndefined();
        });

        it("loads and instantiates the examplePlugin", async () => {
            const { dynamicLoadPlugin } = await import("./pluginLoader");

            const result = await dynamicLoadPlugin("examplePlugin");

            expect(result).toBeDefined();
            expect(result).toBeInstanceOf(Object);
        });
    });
});
