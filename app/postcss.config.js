import autoprefixer from "autoprefixer";
import tailwindcss from "@tailwindcss/postcss";
import doiuse from "doiuse";

const isCI = process.env.CI === "true";
//Checks if this is an interactive terminal environment
const isTTY = process.stdout.isTTY;
const isCLI = isCI || (isTTY && process.env.NODE_ENV !== "development");

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

                // Below CSS warnings/errors are surpressed
                if (
                    title.includes("font-family") ||
                    title.includes("text-decoration") ||
                    title.includes("text-indent") ||
                    title.includes("resize") ||
                    title.includes("::marker") ||
                    title.includes("column layout") ||
                    title.includes("scrollbar") ||
                    title.includes("cursors") ||
                    title.includes("touch-action") ||
                    title.includes("intrinsic & extrinsic sizing") ||
                    title.includes("lch and lab color values") ||
                    !isCLI
                )
                    return;

                throw new Error(`Unsupported CSS Detected: ${usageInfo.featureData.title}`);
            },
        }),
    ],
};
