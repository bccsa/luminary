import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import doiuse from "doiuse";

export default {
    plugins: [
        tailwindcss(),
        autoprefixer(),
        doiuse({
            browsers: [
                "chrome >= 50",
                "firefox >= 45",
                "edge >= 12",
                "opera >= 40",
                "safari >= 9",
                "> 1%",
            ],
            onFeatureUsage: (usageInfo) => {
                console.log(usageInfo.message);
            },
        }),
    ],
};
