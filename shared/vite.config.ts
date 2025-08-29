import { defineConfig } from "vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";
import autoExternal from "rollup-plugin-auto-external";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig({
    // dts is used to generate typescript declaration files
    // autoExternal is used to exclude dependencies from the bundle
    plugins: [dts(), autoExternal(), visualizer({ open: false })], // Open visualiser when reviewing build bundle size
    build: {
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            name: "luminary-shared",
            fileName: "index",
        },
        copyPublicDir: false,
        minify: true,
    },
});
