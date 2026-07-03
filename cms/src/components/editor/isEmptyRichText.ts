/**
 * True when an rte-vue HTML value is an *empty* document.
 *
 * rte-vue serialises an empty editor as `"<p></p>"` (or `"<p><br></p>"`, `"<p>&nbsp;</p>"`) rather
 * than an empty string, and writes that back into the bound model. Callers that treat emptiness as
 * "no value" (e.g. dirty checks / persistence) must normalise that, or a cleared editor reads as a
 * change against an unset baseline. This mirrors rte-vue's own internal empty test.
 *
 * Returns `false` for content that only *looks* textless but carries a non-text node (an image, an
 * `<hr>`, a table) — the single-`<p>` wrapper won't match — so such content is never mistaken for
 * empty and dropped.
 */
export function isEmptyRichText(html?: string): boolean {
    if (!html || !html.trim()) return true;
    const match = html.trim().match(/^<p\b[^>]*>([\s\S]*)<\/p>$/i);
    if (!match) return false;
    return match[1].replace(/<br\s*\/?>/gi, "").replace(/&nbsp;/gi, "").replace(/ /g, "").trim() === "";
}
