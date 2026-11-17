import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import colors from "tailwindcss/colors";
import twScrollbarHide from "tailwind-scrollbar-hide";

export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}", "!./src/**/node_modules"],
    theme: {
        extend: {
            colors: {
                // Dark-mode surface of every dropdown/menu panel; one shade darker than the
                // slate-700 it used to be, so menus sit back from their content (#2276).
                "menu-dark": colors.slate[800],
            },
            fontFamily: {
                sans: ["Inter var", ...defaultTheme.fontFamily.sans],
            },
            keyframes: {
                "running-slug": {
                    "0%": { left: "-40%" },
                    "100%": { left: "100%" },
                },
            },
            animation: {
                "running-slug": "running-slug 1.2s linear infinite",
            },
        },
    },
    // @ts-expect-error
    plugins: [twScrollbarHide, require("@tailwindcss/typography")],
} satisfies Config;
