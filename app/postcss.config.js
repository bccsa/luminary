import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import doiuse from "doiuse";

export default {
    plugins: [
        tailwindcss(),
        autoprefixer(),
        doiuse({
            browsers: [
                "chrome >= 109",
                "firefox >= 109",
                "edge >= 109",
                "opera >= 95",
                "safari >= 16.3",
                "> 1%",
            ],
            onFeatureUsage: (usageInfo) => {
                const title = usageInfo.featureData.title.toLowerCase();

                if (
                    title.includes("font-family") ||
                    title.includes("text-decoration") ||
                    title.includes("text-indent") ||
                    title.includes("resize") ||
                    title.includes("::marker") ||
                    title.includes("column layout") ||
                    title.includes("scrollbar") ||
                    title.includes("cursors") ||
                    title.includes("touch-action") || // TODO:: Look at touch-action support
                    title.includes("intrinsic & extrinsic sizing")
                )
                    return;

                throw new Error(`Unsupported CSS Detected: ${usageInfo.featureData.title}`);
            },
        }),
    ],
};
