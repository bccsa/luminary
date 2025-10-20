import { userPreferencesAsRef } from "@/globalConfig";
import type { Ref } from "vue";

/**
 * Highlights the selected text with the specified color by wrapping it in <mark> elements.
 * Handles both simple (single text node) and complex (multi-node) selections.
 * Prevents nested marks by updating existing marks instead of creating new ones.
 *
 * @param color - RGBA color string for the highlight background
 */
export function highlightTextInDOM(
    color: string = "rgba(255, 255, 0, 0.3)",
    content: Ref<HTMLElement | undefined>,
    contentId: string,
) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    // Check if selection is entirely within a single <mark> element
    let node: Node | null = range.commonAncestorContainer;
    let foundMark: HTMLElement | null = null;

    while (node && node !== content.value) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "MARK") {
            foundMark = node as HTMLElement;
            break;
        }
        node = node.parentNode;
    }

    // If selection is entirely within a mark, just update its color
    if (
        foundMark &&
        range.startContainer.parentNode === foundMark &&
        range.endContainer.parentNode === foundMark
    ) {
        foundMark.style.backgroundColor = color;
        selection.removeAllRanges();
        saveHighlightedContent(content, contentId);
        return;
    }

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    // Simple case: selection within a single text node
    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = startContainer as Text;

        // Check if this text node is already inside a mark
        let parentMark: HTMLElement | null = null;
        let parent: Node | null = textNode.parentNode;
        while (parent && parent !== content.value) {
            if (
                parent.nodeType === Node.ELEMENT_NODE &&
                (parent as HTMLElement).tagName === "MARK"
            ) {
                parentMark = parent as HTMLElement;
                break;
            }
            parent = parent.parentNode;
        }

        if (parentMark) {
            // Just update the color of the existing mark
            parentMark.style.backgroundColor = color;
        } else {
            // Split the text node and wrap the selected portion in a mark
            const text = textNode.textContent || "";
            const before = text.slice(0, startOffset);
            const selected = text.slice(startOffset, endOffset);
            const after = text.slice(endOffset);

            const mark = document.createElement("mark");
            mark.style.backgroundColor = color;
            mark.style.fontWeight = "unset";
            mark.style.color = "unset";
            mark.textContent = selected;

            const parentNode = textNode.parentNode;
            if (parentNode) {
                if (before) {
                    const beforeNode = document.createTextNode(before);
                    parentNode.insertBefore(beforeNode, textNode);
                }
                parentNode.insertBefore(mark, textNode);
                if (after) {
                    const afterNode = document.createTextNode(after);
                    parentNode.insertBefore(afterNode, textNode);
                }
                parentNode.removeChild(textNode);
            }
        }

        selection.removeAllRanges();
        saveHighlightedContent(content, contentId);
        return;
    }

    // Complex case: selection spans multiple nodes (e.g., across paragraphs)
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const nodeRange = document.createRange();
            nodeRange.selectNodeContents(node);
            return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
    });

    // Collect all text nodes that intersect with the selection
    const textNodes: Node[] = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode);
    }

    // Process each intersecting text node individually
    textNodes.forEach((textNode) => {
        if (textNode.nodeType !== Node.TEXT_NODE) return;

        const text = textNode.textContent || "";
        let start = 0;
        let end = text.length;

        // Calculate offsets for start and end nodes
        if (textNode === range.startContainer) {
            start = range.startOffset;
        }
        if (textNode === range.endContainer) {
            end = range.endOffset;
        }

        // Skip if nothing to highlight in this node
        if (start >= end) return;

        // Check if this text node is already inside a mark
        let parentMark: HTMLElement | null = null;
        let parent: Node | null = textNode.parentNode;
        while (parent && parent !== content.value) {
            if (
                parent.nodeType === Node.ELEMENT_NODE &&
                (parent as HTMLElement).tagName === "MARK"
            ) {
                parentMark = parent as HTMLElement;
                break;
            }
            parent = parent.parentNode;
        }

        if (parentMark) {
            // Just update the color of the existing mark
            parentMark.style.backgroundColor = color;
        } else {
            // Split the text node and wrap the selected part in a mark
            const before = text.slice(0, start);
            const selected = text.slice(start, end);
            const after = text.slice(end);

            const mark = document.createElement("mark");
            mark.style.backgroundColor = color;
            mark.style.fontWeight = "unset";
            mark.style.color = "unset";
            mark.textContent = selected;

            const parentNode = textNode.parentNode;
            if (parentNode) {
                if (before) {
                    const beforeNode = document.createTextNode(before);
                    parentNode.insertBefore(beforeNode, textNode);
                }
                parentNode.insertBefore(mark, textNode);
                if (after) {
                    const afterNode = document.createTextNode(after);
                    parentNode.insertBefore(afterNode, textNode);
                }
                parentNode.removeChild(textNode);
            }
        }
    });

    selection.removeAllRanges();
    saveHighlightedContent(content, contentId);
}

/**
 * Saves the current highlighted content (with all marks) to localStorage.
 * Uses the contentId as the storage key to maintain highlights per document.
 */
export function saveHighlightedContent(content: Ref<HTMLElement | undefined>, contentId: string) {
    if (!userPreferencesAsRef.value.highlights) userPreferencesAsRef.value.highlights = {};

    // TODO
    if (content.value) {
        const slotContent = content.value.querySelector(".prose");
        if (slotContent) {
            // localStorage.setItem(`highlights_${props.contentId}`, slotContent.innerHTML);
            userPreferencesAsRef.value.highlights![contentId] = []; // Placeholder for actual highlight data
            const html = slotContent.innerHTML;
            const color = "rgba(255, 255, 0, 0.3)"; // Placeholder color

            userPreferencesAsRef.value.highlights![contentId]!.push({ html, color });
        }
    }
}

/**
 * Restores previously saved highlights from localStorage.
 * Called on component mount to persist highlights across page reloads.
 */
export function restoreHighlightedContent(
    content: Ref<HTMLElement | undefined>,
    contentId: string,
) {
    const currentPostHighlights = userPreferencesAsRef.value.highlights?.[contentId] || [];
    if (!currentPostHighlights) return;

    // Restore highlights in the content
    for (const highlight of currentPostHighlights) {
        if (content.value) {
            const slotContent = content.value.querySelector(".prose");
            if (slotContent) {
                slotContent.innerHTML = highlight.html;
            }
        }
    }
}
