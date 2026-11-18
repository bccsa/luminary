/**
 * The control bar's quality card follows the player's own list of qualities: the skin builds its rows from every
 * level the engine has, so the rows whose height the list leaves out (above a Data Saver cap) are marked and hidden.
 * Auto, and a row whose height cannot be read, always stay.
 */
export function capQualityCard(root: ParentNode, heights: ReadonlySet<number>): void {
    for (const item of root.querySelectorAll<HTMLElement>(
        "media-quality-radio-group media-menu-radio-item",
    )) {
        const label =
            item.querySelector('[data-part~="label"]')?.textContent ?? item.textContent ?? "";
        const height = /^\s*(\d+)p/.exec(label)?.[1];
        const over = heights.size > 0 && height !== undefined && !heights.has(Number(height));
        if (over) item.setAttribute("data-lmpl-capped", "");
        else item.removeAttribute("data-lmpl-capped");
    }
}
