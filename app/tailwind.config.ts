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
        },
    },
    // @ts-expect-error
    plugins: [twScrollbarHide, require("@tailwindcss/typography")],
} satisfies Config;
