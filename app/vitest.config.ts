import { fileURLToPath } from "node:url";
import { mergeConfig, defineConfig, configDefaults } from "vitest/config";
import viteConfig from "./vite.config";
import { loadEnv } from "vite";
import fs from "fs";

export default mergeConfig(
    viteConfig,
    defineConfig({
        plugins: [
            // Load plugins
            {
                name: "Load Plugins For Build",
                buildStart() {
                    // load .env file
                    process.env = { ...process.env, ...loadEnv("", process.cwd()) };
                    const pluginPath = process.env.VITE_PLUGIN_PATH;

                    if (!pluginPath) return;
                    // copy plugins into plugins folder
                    fs.cpSync(pluginPath, "./src/plugins", { recursive: true });
                },
            },
        ],
        test: {
            globals: true,
            environment: "jsdom",
            exclude: [...configDefaults.exclude, "e2e/*"],
            root: fileURLToPath(new URL("./", import.meta.url)),
            setupFiles: ["vitest.setup.ts"],
        },
    }),
);
