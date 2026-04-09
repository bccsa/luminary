import { fileURLToPath } from "node:url";
import { mergeConfig, defineConfig, configDefaults } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            environment: "jsdom",
            exclude: [...configDefaults.exclude, "e2e/*"],
            root: fileURLToPath(new URL("./", import.meta.url)),
            setupFiles: ["vitest.setup.ts"],
            coverage: {
                provider: "v8",
                exclude: [
                    "playwright.config.ts",
                    "postcss.config.js",
                    "tailwind.config.ts",
                    ".eslintrc.cjs",
                    "src/pages/internal/ComponentSandbox.vue",
                    "src/main.ts",
                ],
            },
        },
    }),
);
