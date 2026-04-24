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
                    "0%": { left: "0%", right: "100%" },
                    "50%": { left: "0%", right: "0%" },
                    "100%": { left: "100%", right: "0%" },
                },
            },
            animation: {
                "running-slug": "running-slug 2s ease-in-out infinite",
            },
        },
    },
    // @ts-expect-error
    plugins: [twScrollbarHide, require("@tailwindcss/typography")],
} satisfies Config;
