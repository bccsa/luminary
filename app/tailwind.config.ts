import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import twScrollbarHide from "tailwind-scrollbar-hide";

export default {
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter var", ...defaultTheme.fontFamily.sans],
            },
        },
    },
    plugins: [twScrollbarHide],
} satisfies Config;
