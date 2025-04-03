import postcss from "postcss";
//@ts-expect-error
import doiuse from "doiuse";

async function getInjectedCSS() {
    let css = "";
    document.querySelectorAll("style").forEach((style) => {
        css += style.innerText;
    });
    return css;
}

async function checkCSSCompatibility() {
    const css = await getInjectedCSS();
    if (css) {
        console.log("Extracted CSS:", css);
        postcss([
            doiuse({
                browsers: [
                    "chrome >= 109",
                    "firefox >= 109",
                    "edge >= 109",
                    "opera >= 95",
                    "safari >= 16.3",
                    "> 1%",
                ],
                onFeatureUsage: (usageInfo: any) => {
                    console.warn("Unsupported CSS:", usageInfo.message);
                },
            }),
        ])
            .process(css, { from: undefined })
            .catch((err) => {
                console.error("PostCSS processing error", err);
            });
    }
}

checkCSSCompatibility();
