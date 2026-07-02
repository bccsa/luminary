import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // Consume luminary-shared straight from source for HMR (no rebuild/re-install).
            // `dist` is only used for npm-publish and TypeScript type resolution.
            "luminary-shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
        },
        // shared/src imports these; dedupe so cms + shared share one instance.
        dedupe: ["vue", "dexie", "@vueuse/core"],
    },
    server: {
        port: 4175,
        strictPort: true,
        // Allow Vite to serve the sibling shared/ source (outside this package root).
        fs: { allow: [".."] },
    },
    build: {
        sourcemap: true,
        minify: true,
    },
});
