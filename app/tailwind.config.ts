import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import twScrollbarHide from "tailwind-scrollbar-hide";

export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter var", ...defaultTheme.fontFamily.sans],
            },
            colors: {
                "bcc-brand-50": "#f5f8f8",
                "bcc-brand-100": "#eaeeef",
                "bcc-brand-200": "#d2dadb",
                "bcc-brand-300": "#acbdbd",
                "bcc-brand-400": "#8ea6a6",
                "bcc-brand-500": "#437571",
                "bcc-brand-600": "#004e48",
                "bcc-brand-700": "#023d38",
                "bcc-brand-800": "#021f1c",
                "bcc-brand-900": "#020a0b",
            },
        },
    },
    // @ts-expect-error
    plugins: [twScrollbarHide, require("@tailwindcss/typography")],
} satisfies Config;
