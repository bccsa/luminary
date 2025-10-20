<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { DocumentIcon, PencilIcon } from "@heroicons/vue/24/outline";
import { userPreferencesAsRef } from "@/globalConfig";

/**
 * LHighlightable Component
 *
 * A Vue component that enables text highlighting and copying functionality for content.
 * Users can select text and highlight it with different colors, with highlights persisting
 * across page reloads via localStorage.
 *
 * Features:
 * - Text selection and highlighting with customizable colors
 * - Color change for existing highlights (prevents nested marks)
 * - Copy selected text to clipboard
 * - Persistence using localStorage (per contentId)
 * - Mobile and desktop support
 * - Preserves HTML structure when highlighting across multiple elements
 *
 * @example
 * ```vue
 * <LHighlightable content-id="article-123">
 *   <div v-html="articleContent"></div>
 * </LHighlightable>
 * ```
 */

interface Props {
    /** Unique identifier for the content - used as localStorage key */
    contentId: string;
}

const props = defineProps<Props>();

/** Reference to the content container DOM element */
const content = ref<HTMLElement | null>(null);

/** Controls visibility of the actions menu (highlight/copy buttons) */
const showActions = ref(false);

/** Position of the actions menu relative to the content container */
const actionPosition = ref<{ x: number; y: number } | null>(null);

/** Currently selected text */
const selectedText = ref("");

/** Controls visibility of the color picker */
const showHighlightColors = ref(false);

/** Available highlight colors with their RGBA values */
const supportedColors = {
    yellow: "rgba(255, 255, 0, 0.3)",
    green: "rgba(0, 255, 0, 0.3)",
    blue: "rgba(0, 0, 255, 0.3)",
    pink: "rgba(255, 192, 203, 0.3)",
    orange: "rgba(255, 165, 0, 0.3)",
    purple: "rgba(128, 0, 128, 0.3)",
    cyan: "rgba(0, 255, 255, 0.3)",
    brown: "rgba(165, 42, 42, 0.3)",
    teal: "rgba(0, 128, 128, 0.3)",
};

/**
 * Highlights the selected text with the specified color by wrapping it in <mark> elements.
 * Handles both simple (single text node) and complex (multi-node) selections.
 * Prevents nested marks by updating existing marks instead of creating new ones.
 *
 * @param color - RGBA color string for the highlight background
 */
function highlightTextInDOM(color: string = "rgba(255, 255, 0, 0.3)") {
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
        saveHighlightedContent();
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
        saveHighlightedContent();
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
    saveHighlightedContent();
}

/**
 * Applies highlighting with the specified color and saves the updated content.
 * Hides the color picker and actions menu after highlighting.
 *
 * @param color - RGBA color string for the highlight
 */
function highlightSelectedText(color: string) {
    highlightTextInDOM(color);
    saveHighlightedContent();
    showHighlightColors.value = false;
    selectedText.value = "";
    showActions.value = false;
}

/**
 * Saves the current highlighted content (with all marks) to localStorage.
 * Uses the contentId as the storage key to maintain highlights per document.
 */
function saveHighlightedContent() {
    if (!userPreferencesAsRef.value.highlights) userPreferencesAsRef.value.highlights = {};

    // TODO
    if (content.value) {
        const slotContent = content.value.querySelector(".prose");
        if (slotContent) {
            // localStorage.setItem(`highlights_${props.contentId}`, slotContent.innerHTML);
            userPreferencesAsRef.value.highlights![props.contentId] = []; // Placeholder for actual highlight data
            const html = slotContent.innerHTML;
            const color = "rgba(255, 255, 0, 0.3)"; // Placeholder color

            userPreferencesAsRef.value.highlights![props.contentId]!.push({ html, color });
        }
    }
}

/**
 * Restores previously saved highlights from localStorage.
 * Called on component mount to persist highlights across page reloads.
 */
function restoreHighlightedContent() {
    const currentPostHighlights = userPreferencesAsRef.value.highlights?.[props.contentId] || [];
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

/**
 * Copies the currently selected text to the system clipboard.
 * Uses the modern Clipboard API with fallback error handling.
 * Hides the actions menu after copying.
 */
async function copySelectedText() {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : "";
    if (text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    }
    showActions.value = false;
}

/**
 * Handles pointer up events (mouse/touch) to show the actions menu.
 * Positions the menu near the cursor/touch point.
 *
 * @param event - PointerEvent from the interaction
 */
function onPointerUp(event: PointerEvent) {
    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
    if (selText && content.value) {
        const rect = content.value.getBoundingClientRect();
        showActions.value = true;
        actionPosition.value = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top + 16,
        };
    } else {
        showActions.value = false;
        actionPosition.value = null;
    }
}

/**
 * Updates the selectedText ref when the browser selection changes.
 * Used for monitoring selection state.
 */
function handleSelectionChange() {
    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
}

/**
 * Hides the actions menu when selection is cleared.
 * Prevents the menu from staying visible after deselection.
 */
function onSelectionChange() {
    const selection = window.getSelection();
    if (!selection) return;
    const selText = selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
    if (!selText) {
        showActions.value = false;
        actionPosition.value = null;
    }
}

// Component lifecycle hooks
onMounted(() => {
    // Register selection change listeners for showing/hiding actions menu
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("selectionchange", onSelectionChange);

    // Wait for slot content to render, then restore saved highlights
    setTimeout(() => {
        restoreHighlightedContent();
    }, 100);
});

onUnmounted(() => {
    // Clean up event listeners
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener("selectionchange", onSelectionChange);
});
</script>

<template>
    <div>
        <!-- Content container with pointer event handling -->
        <div class="relative" ref="content" @pointerup="onPointerUp">
            <!-- Slot for the highlightable content -->
            <slot></slot>

            <!-- Actions menu (highlight/copy buttons) -->
            <div
                v-if="showActions && actionPosition"
                class="pointer-events-auto absolute z-[9999] flex w-max max-w-[calc(100vw-20px)] items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg"
                :style="{
                    left: actionPosition.x + 'px',
                    top: actionPosition.y + 'px',
                }"
            >
                <!-- Color picker palette (shown when highlight button clicked) -->
                <div v-if="showHighlightColors">
                    <button
                        v-for="(c, name) in supportedColors"
                        class="m-1 h-6 w-6 rounded-full"
                        :key="name"
                        :style="{ backgroundColor: c }"
                        @click.prevent="highlightSelectedText(c)"
                        :aria-label="`Highlight with ${name} color`"
                    ></button>
                </div>

                <!-- Main action buttons (highlight/copy) -->
                <div class="flex gap-1 divide-x" v-else>
                    <button
                        class="flex w-max flex-col items-center justify-center gap-1 px-2"
                        @click="showHighlightColors = true"
                        aria-label="Show highlight colors"
                    >
                        <PencilIcon class="size-6" />
                        <span class="text-xs">Highlight</span>
                    </button>
                    <button
                        class="flex w-max flex-col items-center justify-center gap-1 px-2"
                        @click="copySelectedText"
                        aria-label="Copy selected text"
                    >
                        <DocumentIcon class="size-6" />
                        <span class="text-xs">Copy</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
