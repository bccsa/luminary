import type { Router } from "vue-router";
import type { HighlightRange } from "luminary-shared";
import { HIGHLIGHT_COLORS } from "@/util/highlightRanges";

const MAX_TEXT_IN_URL = 120;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const findPassage = (text: string): globalThis.Range | undefined => {
    const snippet = squash(text).slice(0, 60).toLowerCase();
    if (!snippet) return undefined;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
            node.parentElement?.closest('[data-test="activity-excerpt"], script, style, noscript')
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
    });

    let flat = "";
    const map: { node: Text; offset: number }[] = [];
    let prevSpace = false;

    for (
        let node = walker.nextNode() as Text | null;
        node;
        node = walker.nextNode() as Text | null
    ) {
        const value = node.nodeValue ?? "";
        for (let i = 0; i < value.length; i++) {
            let ch = value[i];
            if (/\s/.test(ch)) {
                if (prevSpace) continue;
                ch = " ";
                prevSpace = true;
            } else {
                prevSpace = false;
            }
            flat += ch.toLowerCase();
            map.push({ node, offset: i });
        }
    }

    const at = flat.indexOf(snippet);
    if (at === -1) return undefined;

    const first = map[at];
    const last = map[at + snippet.length - 1];
    const found = document.createRange();
    found.setStart(first.node, first.offset);
    found.setEnd(last.node, last.offset + 1);
    return found;
};

const scrollToPassage = (range: HighlightRange, attempt = 0) => {
    const found = findPassage(range.text);

    if (found) {
        const el = found.startContainer.parentElement;
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        const previous = { outline: el.style.outline, transition: el.style.transition };
        el.style.transition = "outline-color 0.4s ease";
        el.style.outline = `3px solid ${HIGHLIGHT_COLORS[range.color]}`;
        el.style.outlineOffset = "2px";
        setTimeout(() => {
            el.style.outline = previous.outline;
            el.style.transition = previous.transition;
            el.style.outlineOffset = "";
        }, 2500);
        return;
    }

    if (attempt < 40) setTimeout(() => scrollToPassage(range, attempt + 1), 200);
};

/**
 * Open the article a highlight belongs to and bring the reader to the passage, outlined in
 * the colour it was highlighted in.
 */
export const openHighlight = async (router: Router, slug: string, range: HighlightRange) => {
    await router.push({
        name: "content",
        params: { slug },
        query: {
            highlightStart: String(range.start),
            highlightText: range.text.slice(0, MAX_TEXT_IN_URL),
            highlightColor: range.color,
        },
    });

    scrollToPassage(range);
};
