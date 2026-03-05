import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    optimizeDeps: {
        // Ensure workspace luminary-shared is pre-bundled from source so exports (e.g. updateAuthToken) are current
        include: ["luminary-shared"],
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        port: 4175,
        strictPort: true,
    },
    build: {
        sourcemap: true,
        minify: true,
    },
});
