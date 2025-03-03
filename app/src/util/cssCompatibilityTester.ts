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
                    "chrome >= 96",
                    "firefox >= 94",
                    "edge >= 96",
                    "opera >= 81",
                    "safari >= 15",
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
