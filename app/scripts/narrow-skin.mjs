import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * What this player is: the default theme, the video preset. The skin has rules for others, which PurgeCSS cannot
 * tell apart because they differ by attribute, and which this player can never match.
 */
const THEME = "default";
const PRESET = "video";

const attrValue = (attr) => (attr.value ?? "").replace(/["']/g, "");
const isForeign = (attr) => {
    const name = attr.attribute.trim();
    return (
        (name === "data-theme" && attrValue(attr) !== THEME) ||
        (name === "data-preset" && attrValue(attr) !== PRESET)
    );
};
const isOwn = (attr) => {
    const name = attr.attribute.trim();
    return (
        (name === "data-theme" && attrValue(attr) === THEME) ||
        (name === "data-preset" && attrValue(attr) === PRESET)
    );
};

/**
 * Narrows one selector to this player, in place. False when it can never match.
 *
 * Inside `:is()` and `:where()` only the alternatives naming another theme or preset go:
 * `:is([data-preset="video"], [data-preset="live-video"])` still matches this player, through its first one.
 * An alternative that is nothing but this player's own attribute keeps it, since an empty one is invalid and
 * dropping the whole list would change the rule's specificity.
 */
function narrowSelector(selector) {
    for (const node of [...selector.nodes]) {
        if (node.type === "attribute") {
            if (isForeign(node)) return false;
        } else if (node.type === "pseudo" && (node.value === ":is" || node.value === ":where")) {
            for (const alternative of [...node.nodes]) {
                if (!narrowSelector(alternative)) alternative.remove();
            }
            if (node.nodes.length === 0) return false;
        }
    }
    const own = selector.nodes.filter((node) => node.type === "attribute" && isOwn(node));
    if (own.length < selector.nodes.length) own.forEach((attr) => attr.remove());
    return true;
}

/**
 * Drops the selectors for any other theme or preset, and strips the two attributes this player always has
 * from the ones that remain. Nearly every selector in the skin opens with
 * `:where(.media-skin[data-theme="default"][data-preset="video"])`; with the attributes gone it is
 * `:where(.media-skin)`, which has the same specificity (none, inside `:where`) and so cannot change which
 * rule wins. Hundreds of repetitions of the longer form were a fifth of the file.
 *
 * @param {string} css
 * @returns {string}
 */
export function narrowToThisPlayer(css) {
    const root = postcss.parse(css);
    root.walkRules((rule) => {
        const transformer = selectorParser((selectors) => {
            selectors.each((selector) => {
                if (!narrowSelector(selector)) selector.remove();
            });
        });
        rule.selector = transformer.processSync(rule.selector);
        if (rule.selector.trim() === "") rule.remove();
    });
    // A block left with nothing in it.
    root.walkAtRules((at) => {
        if (
            at.nodes &&
            at.nodes.length === 0 &&
            /^(media|container|supports|layer)$/.test(at.name) &&
            at.params
        )
            at.remove();
    });
    return root.toString();
}
