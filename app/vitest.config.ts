import { fileURLToPath } from "node:url";
import { mergeConfig, defineConfig, configDefaults } from "vitest/config";
import viteConfig from "./vite.config";
import { loadEnv } from "vite";
import util from "util";
import child_process from "child_process";
const exec = util.promisify(child_process.exec);

export default mergeConfig(
    viteConfig,
    defineConfig({
        plugins: [
            // Load plugins
            {
                name: "Load Plugins For Build",
                async buildStart() {
                    // load .env file
                    process.env = { ...process.env, ...loadEnv("", process.cwd()) };
                    const pluginPath = process.env.VITE_PLUGIN_PATH;

                    if (!pluginPath) return;
                    // copy plugins into plugins folder
                    try {
                        await exec(`cp -R ${pluginPath}/* ./src/plugins`);
                    } catch (err: any) {
                        console.log(err.message);
                    }
                },
            },
        ],
        test: {
            globals: true,
            environment: "jsdom",
            // HybridQuery exercises the real (un-mocked) mangoToDexie, making the
            // multi-query page chains heavier than the old mocked path. Under full
            // parallel load these can exceed vitest's 5s default; give them headroom
            // so wait-for-expect (not the test timeout) governs.
            testTimeout: 20000,
            hookTimeout: 20000,
            // Cap worker concurrency (~half this host's 8 cores). HybridQuery's real
            // (un-mocked) mangoToDexie read path is heavier than the old mock, and at
            // full parallelism the contention occasionally pushed a heavy content-list
            // test past its timeout (an intermittent flake). Trades a little suite
            // wall-time for deterministic runs. Set on both pools since vitest's default
            // is "threads"; a top-level `maxWorkers: "50%"` tripped a tinypool
            // RangeError on 1.6.1.
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
