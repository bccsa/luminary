/** Highlight colours offered to the reader, keyed by the name that is persisted. */
export const HIGHLIGHT_COLORS = {
    yellow: "rgba(253, 224, 71, 0.5)",
    green: "rgba(74, 222, 128, 0.5)",
    blue: "rgba(96, 165, 250, 0.5)",
    pink: "rgba(244, 114, 182, 0.5)",
    purple: "rgba(192, 132, 252, 0.5)",
} as const;

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;

/**
 * A highlight as character offsets into the article's text. `text` is the quoted passage,
 * used to find the highlight again after the article has been edited.
 */
export type HighlightRange = { start: number; end: number; color: HighlightColor; text: string };

const WORD_CHAR = /[\p{L}\p{N}\p{M}'’_-]/u;
const SPACE = /\s/;
const isWord = (text: string, i: number) => i >= 0 && i < text.length && WORD_CHAR.test(text[i]);

/**
 * Widens a selection to whole words and trims surrounding whitespace, so a slipped finger
 * never leaves half a word highlighted. Undefined when the selection holds no word at all
 * (only whitespace or punctuation), so a stray tap can't highlight a lone full stop.
 */
export function snapToWords(
    text: string,
    start: number,
    end: number,
): { start: number; end: number } | undefined {
    while (start < end && SPACE.test(text[start])) start++;
    while (end > start && SPACE.test(text[end - 1])) end--;
    if (![...text.slice(start, end)].some((c) => WORD_CHAR.test(c))) return undefined;
    while (isWord(text, start) && isWord(text, start - 1)) start--;
    while (isWord(text, end - 1) && isWord(text, end)) end++;
    return { start, end };
}

const TERMINATOR = /[.,;:!?…]/;
const DASH = /[–—]/;
const CLOSER = /["'”’»)\]]/;

/**
 * Runs a highlight's end on to the next punctuation mark (and any closing quote after it),
 * so it ends where the phrase does rather than wherever the finger lifted. Never passes
 * `limit` (the end of the paragraph), stops short of a dash, and ignores a mark inside a
 * word such as "3.5".
 */
export function extendToPunctuation(text: string, end: number, limit = text.length): number {
    const backOffSpace = (i: number) => {
        while (i > end && SPACE.test(text[i - 1])) i--;
        return i;
    };
    let k = end;
    while (k > 0 && CLOSER.test(text[k - 1])) k--;
    if (k > 0 && TERMINATOR.test(text[k - 1])) return end;

    for (let i = end; i < limit; i++) {
        const c = text[i];
        if (c === "\n" || DASH.test(c)) return backOffSpace(i);
        if (TERMINATOR.test(c) && !isWord(text, i + 1)) {
            let j = i + 1;
            while (j < limit && CLOSER.test(text[j])) j++;
            return j;
        }
    }
    return backOffSpace(Math.max(limit, end));
}

const byStart = (a: HighlightRange, b: HighlightRange) => a.start - b.start;

/**
 * Adds a highlight. Same-colour highlights it overlaps or touches merge into it, so a
 * highlight can be extended; a different colour is painted over only the selected part,
 * leaving the rest of the old highlight either side.
 */
export function addHighlight(
    ranges: HighlightRange[],
    text: string,
    start: number,
    end: number,
    color: HighlightColor,
): HighlightRange[] {
    const sorted = [...ranges].sort(byStart);
    for (const r of sorted) {
        if (r.color === color && r.end >= start && r.start <= end) {
            start = Math.min(start, r.start);
            end = Math.max(end, r.end);
        }
    }

    const result: HighlightRange[] = [{ start, end, color, text: text.slice(start, end) }];
    for (const r of sorted) {
        if (r.color === color && r.end >= start && r.start <= end) continue; // merged above
        if (!overlaps(r, start, end)) {
            result.push(r);
            continue;
        }
        for (const [from, to] of [
            [r.start, start],
            [end, r.end],
        ]) {
            const piece = trimToWords(text, from, to);
            if (piece)
                result.push({ ...piece, color: r.color, text: text.slice(piece.start, piece.end) });
        }
    }
    return result.sort(byStart);
}

/** The part of [from, to) left after trimming edge whitespace, if it still holds a word. */
function trimToWords(text: string, from: number, to: number) {
    while (from < to && SPACE.test(text[from])) from++;
    while (to > from && SPACE.test(text[to - 1])) to--;
    const hasWord = [...text.slice(from, to)].some((c) => WORD_CHAR.test(c));
    return hasWord ? { start: from, end: to } : undefined;
}

/** Removes every highlight the selection touches, whole — not just the selected part. */
export function removeHighlights(
    ranges: HighlightRange[],
    start: number,
    end: number,
): HighlightRange[] {
    return ranges.filter((r) => !overlaps(r, start, end));
}

export function overlaps(range: { start: number; end: number }, start: number, end: number) {
    return range.start < end && range.end > start;
}

/**
 * Re-anchors saved highlights onto the article's current text: kept where the quote still
 * matches, moved to the nearest occurrence if the text shifted, dropped if it's gone.
 */
export function anchorHighlights(saved: HighlightRange[], text: string): HighlightRange[] {
    const anchored: HighlightRange[] = [];
    for (const r of saved) {
        if (!r.text) continue;
        let start = text.slice(r.start, r.end) === r.text ? r.start : -1;
        if (start < 0) {
            let best = Infinity;
            for (let i = text.indexOf(r.text); i >= 0; i = text.indexOf(r.text, i + 1)) {
                if (Math.abs(i - r.start) < best) {
                    best = Math.abs(i - r.start);
                    start = i;
                }
            }
        }
        if (start < 0) continue;
        const end = start + r.text.length;
        // Two quotes can land on the same passage after an edit; the first one wins.
        if (anchored.some((a) => overlaps(a, start, end))) continue;
        anchored.push({ ...r, start, end });
    }
    return anchored.sort(byStart);
}

/** Validates persisted ranges, tolerating anything a future or corrupt write left behind. */
export function parseSavedRanges(value: unknown): HighlightRange[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter(
        (r): r is HighlightRange =>
            !!r &&
            typeof r === "object" &&
            Number.isInteger(r.start) &&
            Number.isInteger(r.end) &&
            r.end > r.start &&
            typeof r.text === "string" &&
            r.color in HIGHLIGHT_COLORS,
    );
}

const colorByCss = new Map(
    Object.entries(HIGHLIGHT_COLORS).map(([name, css]) => [css.replace(/\s/g, ""), name]),
);

/** Converts the old whole-article-HTML storage into ranges over that article's text. */
export function rangesFromLegacyHtml(html: string): HighlightRange[] {
    const template = document.createElement("template");
    template.innerHTML = html;
    const text = template.content.textContent ?? "";

    let ranges: HighlightRange[] = [];
    let offset = 0;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const mark = node.parentElement?.closest("mark");
        if (mark && node.data.trim()) {
            const css = mark.style.backgroundColor.replace(/\s/g, "");
            const color = (colorByCss.get(css) ?? "yellow") as HighlightColor;
            ranges = addHighlight(ranges, text, offset, offset + node.length, color);
        }
        offset += node.length;
    }
    return ranges;
}

// DOM

/** Character offset of a DOM boundary point within `root`'s text. */
export function textOffset(root: Node, node: Node, offset: number): number {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(node, offset);
    return range.toString().length;
}

const MARK_ATTR = "data-highlight";

/**
 * Renders `ranges` as `<mark>`s over `root`'s current text, replacing any it painted
 * before. Marks that came with the article itself are left alone.
 */
export function paintHighlights(root: HTMLElement, ranges: HighlightRange[]) {
    for (const mark of root.querySelectorAll(`mark[${MARK_ATTR}]`)) {
        const parent = mark.parentNode!;
        mark.replaceWith(...mark.childNodes);
        parent.normalize();
    }
    if (!ranges.length) return;

    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    let offset = 0;
    for (const node of nodes) {
        const nodeStart = offset;
        offset += node.length;
        // Whitespace between block elements can't take a mark without breaking the markup.
        if (!node.data.trim()) continue;

        const pieces = ranges
            .filter((r) => overlaps(r, nodeStart, offset))
            .map((r) => ({
                from: Math.max(r.start, nodeStart) - nodeStart,
                to: Math.min(r.end, offset) - nodeStart,
                color: r.color,
            }));
        // Last piece first, so splitting leaves the earlier offsets in `node` intact.
        for (const { from, to, color } of pieces.reverse()) {
            if (to < node.length) node.splitText(to);
            const part = from > 0 ? node.splitText(from) : node;
            const mark = document.createElement("mark");
            mark.setAttribute(MARK_ATTR, color);
            mark.style.backgroundColor = HIGHLIGHT_COLORS[color];
            mark.className = "rounded-sm box-decoration-clone";
            part.replaceWith(mark);
            mark.appendChild(part);
        }
    }
}
