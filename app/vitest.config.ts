import { fileURLToPath } from "node:url";
import { mergeConfig, defineConfig, configDefaults } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            environment: "jsdom",
            // HybridQuery exercises the real (un-mocked) mangoToDexie, making the
            // multi-query page chains heavy. Under full parallel load these can exceed
            // vitest's 5s default; give them headroom so wait-for-expect (not the test
            // timeout) governs.
            testTimeout: 20000,
            hookTimeout: 20000,
            // Cap worker concurrency: HybridQuery's real (un-mocked) mangoToDexie
            // read path is heavy, and at full parallelism the contention can push a
            // heavy content-list test past its timeout. Trades a little suite
            // wall-time for deterministic runs. Set on both pools since vitest's
            // default is "threads"; a top-level `maxWorkers: "50%"` trips a tinypool
            // RangeError.
            poolOptions: {
                threads: { maxThreads: 4, minThreads: 1 },
                forks: { maxForks: 4, minForks: 1 },
            },
            exclude: [...configDefaults.exclude, "e2e/*"],
            root: fileURLToPath(new URL("./", import.meta.url)),
            setupFiles: ["vitest.setup.ts"],
            coverage: {
                provider: "v8",
                exclude: [
                    "playwright.config.ts",
                    "postcss.config.js",
                    "tailwind.config.ts",
                    "src/main.ts",
                    "src/analytics.ts",
                    "src/analytics/**",
                    "src/assets/vite-plugins/**",
                    "src/auth.ts",
                    "src/guards/**",
                    "src/util/waitUntilAuth0IsLoaded.ts",
                ],
            },
        },
    }),
);
