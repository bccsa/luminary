import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import twScrollbarHide from "tailwind-scrollbar-hide";

export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}", "!./src/**/node_modules"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter var", ...defaultTheme.fontFamily.sans],
            },
            keyframes: {
                "running-slug": {
                    "0%": { left: "-40%" },
                    "100%": { left: "100%" },
                },
                "loading-bar": {
                    "0%": { width: "0%" },
                    "100%": { width: "100%" },
                },
            },
            animation: {
                "running-slug": "running-slug 1.2s linear infinite",
                "loading-bar": "loading-bar 5s ease-in infinite",
            },
        },
    },
    // @ts-expect-error
    plugins: [twScrollbarHide, require("@tailwindcss/typography")],
} satisfies Config;
