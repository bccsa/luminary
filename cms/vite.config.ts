import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            "luminary-shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
        },
    },
    server: {
        port: 4175,
        strictPort: true,
        host: '0.0.0.0',
    },
    build: {
        sourcemap: true,
        minify: true,
    },
});
