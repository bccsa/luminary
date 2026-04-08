import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";
import { loadEnv } from "vite";

const env = loadEnv("", process.cwd());
const source = env.VITE_LOGO_FAVICON || "src/assets/favicon.png";

export default defineConfig({
    headLinkOptions: {
        preset: "2023",
    },
    preset: minimal2023Preset,
    images: [source],
});
