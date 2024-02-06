import type { Config } from "tailwindcss";
const defaultTheme = require("tailwindcss/defaultTheme");

export default {
    content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter var", ...defaultTheme.fontFamily.sans],
            },
            backgroundImage: {
                shimmer:
                    "linear-gradient(90deg,rgba(255,255,255,0) 0,rgba(255,255,255,.2) 20%,rgba(255,255,255,.5) 60%,rgba(255,255,255,0))",
            },
            animation: {
                shimmer: "shimmer 5s infinite",
            },
            keyframes: {
                shimmer: {
                    "100%": { transform: "translate(100%)" },
                },
            },
        },
    },
    plugins: [require("@tailwindcss/forms")],
} satisfies Config;
