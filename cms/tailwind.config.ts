import type { Config } from "tailwindcss";
const defaultTheme = require("tailwindcss/defaultTheme");

export default {
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
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
                bob: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-0.08em)" },
                },
            },
            animation: {
                "running-slug": "running-slug 1.5s linear infinite",
                "bob-1": "bob 0.85s ease-in-out 0.5s infinite",
                "bob-2": "bob 0.95s ease-in-out 0.2s infinite",
                "bob-3": "bob 0.65s ease-in-out 0.45s infinite",
            },
        },
    },
    plugins: [
        require("@tailwindcss/forms"),
        require("@tailwindcss/typography"),
        require("tailwind-scrollbar-hide"),
    ],
} satisfies Config;
