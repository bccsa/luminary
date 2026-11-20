import type { HighlightRange } from "luminary-shared";
import { anchorHighlights } from "@/util/highlightRanges";

const LINE_BREAKING =
    /^(P|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH|DD|DT|FIGCAPTION|DIV|UL|OL|TABLE|TR|FIGURE|HR|BR)$/;
const ENDS_SENTENCE = /[.,;:!?…]["'”’»)\]]*$/u;

/** The article's text (identical to its `textContent`) and the offsets where a line breaks. */
function textWithBreaks(html: string): { text: string; breaks: Set<number> } {
    const template = document.createElement("template");
    template.innerHTML = html;

    let text = "";
    const breaks = new Set<number>();
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += (node as Text).data;
            return;
        }
        const breaking = node instanceof Element && LINE_BREAKING.test(node.tagName);
        if (breaking) breaks.add(text.length);
        node.childNodes.forEach(walk);
        if (breaking) breaks.add(text.length);
    };
    walk(template.content);
    return { text, breaks };
}

/** Joins lines with a space, adding a full stop where a line doesn't already end a sentence. */
export function joinLines(lines: string[]): string {
    return lines
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .reduce((joined, line) => {
            if (!joined) return line;
            return `${joined}${ENDS_SENTENCE.test(joined) ? "" : "."} ${line}`;
        }, "");
}

/**
 * The saved passages as one readable line each. A range's `text` is a slice of the article's
 * `textContent`, which runs paragraphs together ("commandmentsIf"), so the line breaks are
 * recovered from the article's HTML.
 */
export function highlightExcerpts(html: string | undefined, ranges: HighlightRange[]): string[] {
    if (!html) return ranges.map((r) => joinLines([r.text]));
    const { text, breaks } = textWithBreaks(html);

    return ranges.map((r) => {
        const [found] = anchorHighlights([r], text);
        if (!found) return joinLines([r.text]);

        const lines: string[] = [];
        let from = found.start;
        for (let i = found.start + 1; i < found.end; i++) {
            if (!breaks.has(i)) continue;
            lines.push(text.slice(from, i));
            from = i;
        }
        lines.push(text.slice(from, found.end));
        return joinLines(lines);
    });
}
