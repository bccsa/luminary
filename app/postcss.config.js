import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import doiuse from "doiuse";

// Can ignore the following error (this file is outside the scope of the browser -- it will be defined at runtime):
// Error: 'process' is not defined.
// eslint-disable-next-line no-undef
const isCI = process.env.CI === "true";
// eslint-disable-next-line no-undef
const isTTY = process.stdout.isTTY;
// eslint-disable-next-line no-undef
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
                    title.includes("box-decoration") ||
                    !isCLI
                ) {
                    return;
                }

                throw new Error(
                    `Critical unsupported CSS Detected: ${usageInfo.featureData.title}`,
                );
            },
        }),
    ],
};
