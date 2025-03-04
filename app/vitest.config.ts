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
            exclude: [...configDefaults.exclude, "e2e/*"],
            root: fileURLToPath(new URL("./", import.meta.url)),
            setupFiles: ["vitest.setup.ts"],
        },
    }),
);
