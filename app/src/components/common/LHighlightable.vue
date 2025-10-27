<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Ref } from "vue";
import { DocumentIcon, MinusCircleIcon, PencilIcon } from "@heroicons/vue/24/outline";
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
const content = ref<HTMLElement | undefined>(undefined);

/** Currently selected text */
const selectedText = ref("");

/** Flag to track if we're currently interacting with the menu */
const isInteractingWithMenu = ref(false);

/** Flag to track if we're currently in a touch selection */
const isSelecting = ref(false);

/** Controls visibility of the actions menu (highlight/copy buttons) */
const showActions = ref(false);

/** Long press timer */
const longPressTimer = ref<number | undefined>(undefined);

/** Auto-scroll interval ID */
const autoScrollInterval = ref<number | undefined>(undefined);

/** Position of the actions menu relative to the content container */
const actionPosition = ref<{ x: number; y: number } | undefined>(undefined);

/** Reference to the actions menu DOM element */
const actionsMenu = ref<HTMLElement | undefined>(undefined);

/** Controls visibility of the color picker */
const showHighlightColors = ref(false);

/** Flag to prevent immediate menu dismissal after showing it */
const justShownMenu = ref(false);

// Constants
const LONG_PRESS_DURATION = 500;
const SCROLL_INTERVAL = 16;
const SCROLL_SPEED = 5;
const SCROLL_THRESHOLD_TOP = 150;
const SCROLL_THRESHOLD_BOTTOM = 120;
const MENU_WIDTH = 200;
const MENU_HEIGHT = 100;

function clearTimer(timer: Ref<number | undefined>) {
    if (timer.value) {
        clearTimeout(timer.value);
        timer.value = undefined;
    }
}

function clearIntervalRef(interval: Ref<number | undefined>) {
    if (interval.value) {
        clearInterval(interval.value);
        interval.value = undefined;
    }
}

/** Whether long press was triggered */
const isLongPress = ref(false);

/** Store the initial touch position for selection */
const initialTouch = ref<{ x: number; y: number } | null>(null);

/** Store the current selection range during touch */
const touchSelection = ref<Range | null>(null);

function updateSelection(initialRange: Range, currentRange: Range) {
    const selection = window.getSelection();
    if (!selection) return;

    const comparison = initialRange.compareBoundaryPoints(Range.START_TO_START, currentRange);

    const range = document.createRange();
    if (comparison <= 0) {
        range.setStart(initialRange.startContainer, initialRange.startOffset);
        range.setEnd(currentRange.endContainer, currentRange.endOffset);
    } else {
        range.setStart(currentRange.startContainer, currentRange.startOffset);
        range.setEnd(initialRange.endContainer, initialRange.endOffset);
    }

    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Handle touch start events to ensure text selection works on mobile
 */
function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];

    initialTouch.value = { x: touch.clientX, y: touch.clientY };
    isSelecting.value = false;
    isLongPress.value = false;
    touchSelection.value = null;

    clearIntervalRef(autoScrollInterval);
    clearTimer(longPressTimer);
    longPressTimer.value = window.setTimeout(() => {
        isLongPress.value = true;
        navigator.vibrate?.(50);
    }, LONG_PRESS_DURATION);
}

/**
 * Handle touch move events to ensure text selection works on mobile
 */
function onTouchMove(event: TouchEvent) {
    event.preventDefault();

    if (event.touches.length !== 1 || !initialTouch.value) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - initialTouch.value.x);
    const deltaY = Math.abs(touch.clientY - initialTouch.value.y);

    if ((deltaX > 10 || deltaY > 10) && longPressTimer.value && !isLongPress.value) {
        clearTimer(longPressTimer);
        return;
    }

    if (!(isLongPress.value && (deltaX > 5 || deltaY > 5))) return;

    if (!isSelecting.value) {
        isSelecting.value = true;
        const startRange = document.caretRangeFromPoint(initialTouch.value.x, initialTouch.value.y);
        if (startRange) {
            touchSelection.value = startRange;
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(startRange);
        }
    }

    const currentRange = document.caretRangeFromPoint(touch.clientX, touch.clientY);

    if (currentRange && touchSelection.value) updateSelection(touchSelection.value, currentRange);

    clearIntervalRef(autoScrollInterval);

    const viewportHeight = window.innerHeight;

    const touchY = touch.clientY;
    const isInAutoScrollZone =
        touchY < SCROLL_THRESHOLD_TOP || touchY > viewportHeight - SCROLL_THRESHOLD_BOTTOM;

    if (isInAutoScrollZone) {
        autoScrollInterval.value = window.setInterval(() => {
            window.scrollBy(0, touchY < SCROLL_THRESHOLD_TOP ? -SCROLL_SPEED : SCROLL_SPEED);
            if (touchSelection.value && initialTouch.value) {
                const currentRange = document.caretRangeFromPoint(touch.clientX, touch.clientY);
                if (currentRange) updateSelection(touchSelection.value, currentRange);
            }
        }, SCROLL_INTERVAL);
    }
}

function onTouchEnd(event: TouchEvent, content: Ref<HTMLElement | undefined>) {
    clearTimer(longPressTimer);
    clearIntervalRef(autoScrollInterval);

    if (!isSelecting.value) {
        initialTouch.value = null;
        touchSelection.value = null;
        isLongPress.value = false;
        return;
    }
    isSelecting.value = false;

    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";

    if (!(selText && content.value)) {
        initialTouch.value = null;
        touchSelection.value = null;
        isLongPress.value = false;
        return;
    }

    const contentRect = content.value.getBoundingClientRect();

    let menuX = 0,
        menuY = 0;

    const rangeRect = selection!.getRangeAt(0).getBoundingClientRect();
    menuX = rangeRect.left - contentRect.left;
    menuY = rangeRect.bottom - contentRect.top + 4;
    const touch = event.changedTouches[0];
    menuX = touch.clientX - contentRect.left;
    menuY = touch.clientY - contentRect.top + 16;

    // Adjust position to prevent clipping off screen
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const absoluteX = contentRect.left + menuX;

    if (absoluteX + MENU_WIDTH > viewportWidth)
        menuX = viewportWidth - contentRect.left - MENU_WIDTH - 10;

    if (menuX < 0) menuX = 10;

    const absoluteY = contentRect.top + menuY;
    const isClippingBottom = absoluteY + MENU_HEIGHT > viewportHeight;

    if (isClippingBottom) {
        const rangeRect = selection!.getRangeAt(0).getBoundingClientRect();
        menuY = rangeRect.top - contentRect.top - MENU_HEIGHT - 4;
        menuY = menuY - MENU_HEIGHT - 20;
    }

    if (contentRect.top + menuY < 0) menuY = -contentRect.top + 10;

    showActions.value = true;
    actionPosition.value = { x: menuX, y: menuY };
    initialTouch.value = null;
    touchSelection.value = null;
    isLongPress.value = false;
}

/**
 * Applies highlighting with the specified color and saves the updated content.
 * Hides the color picker and actions menu after highlighting.
 *
 * @param color - RGBA color string for the highlight
 */
function highlightSelectedText(
    color: string,
    content: Ref<HTMLElement | undefined>,
    contentId: string,
) {
    highlightTextInDOM(color, content, contentId);
    saveHighlightedContent(content, contentId);
    showHighlightColors.value = false;
    selectedText.value = "";
    showActions.value = false;
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

    // Don't hide the menu if we're interacting with it or currently selecting or menu is showing
    if (!selText && !isInteractingWithMenu.value && !isSelecting.value && !showActions.value) {
        showActions.value = false;
        actionPosition.value = undefined;
    }
}

/**
 * Marks the beginning of menu interaction to prevent it from disappearing
 */
function onMenuPointerDown() {
    isInteractingWithMenu.value = true;
}

function getParentMark(node: Node, root: Node | null): HTMLElement | null {
    let parent: Node | null = node.parentNode;
    while (parent && parent !== root) {
        if (parent.nodeType === Node.ELEMENT_NODE && (parent as HTMLElement).tagName === "MARK") {
            return parent as HTMLElement;
        }
        parent = parent.parentNode;
    }
    return null;
}

function createMark(selected: string, color: string): HTMLElement {
    const mark = document.createElement("mark");
    mark.style.backgroundColor = color;
    mark.style.fontWeight = "unset";
    mark.style.color = "unset";
    mark.textContent = selected;
    return mark;
}

function updateMarkColor(mark: HTMLElement, color: string) {
    mark.style.backgroundColor = color;
}

/**
 * Highlights the selected text with the specified color by wrapping it in <mark> elements.
 * Handles both simple (single text node) and complex (multi-node) selections.
 * Prevents nested marks by updating existing marks instead of creating new ones.
 *
 * @param color - RGBA color string for the highlight background
 */
function highlightTextInDOM(
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
        updateMarkColor(foundMark, color);
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
        const parentMark = getParentMark(textNode, content.value ?? null);

        if (parentMark) {
            updateMarkColor(parentMark, color);
        } else {
            const text = textNode.textContent || "";
            const before = text.slice(0, startOffset);
            const selected = text.slice(startOffset, endOffset);
            const after = text.slice(endOffset);
            const mark = createMark(selected, color);
            const parentNode = textNode.parentNode;

            if (parentNode) {
                if (before) parentNode.insertBefore(document.createTextNode(before), textNode);
                parentNode.insertBefore(mark, textNode);
                if (after) parentNode.insertBefore(document.createTextNode(after), textNode);
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
        if (textNode === range.startContainer) start = range.startOffset;
        if (textNode === range.endContainer) end = range.endOffset;

        if (start >= end) return;

        const parentMark = getParentMark(textNode, content.value ?? null);
        if (parentMark) {
            updateMarkColor(parentMark, color);
        } else {
            const before = text.slice(0, start);
            const selected = text.slice(start, end);
            const after = text.slice(end);
            const mark = createMark(selected, color);
            const parentNode = textNode.parentNode;
            if (parentNode) {
                if (before) parentNode.insertBefore(document.createTextNode(before), textNode);
                parentNode.insertBefore(mark, textNode);
                if (after) parentNode.insertBefore(document.createTextNode(after), textNode);
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
function saveHighlightedContent(content: Ref<HTMLElement | undefined>, contentId: string) {
    if (!userPreferencesAsRef.value.highlights) userPreferencesAsRef.value.highlights = {};

    if (content.value) {
        const slotContent = content.value.querySelector(".prose");
        if (slotContent) {
            const html = slotContent.innerHTML;

            // Check if there are any marks in the HTML
            const hasMarks = html.includes("<mark");

            if (hasMarks) {
                // Save the HTML with highlights
                userPreferencesAsRef.value.highlights[contentId] = [
                    { html, color: "rgba(255, 255, 0, 0.3)" },
                ];
            } else
                // No marks, remove the highlights entry for this content
                delete userPreferencesAsRef.value.highlights[contentId];

            // Manually trigger localStorage update since the watcher might not catch deep changes
            localStorage.setItem("userPreferences", JSON.stringify(userPreferencesAsRef.value));
        }
    }
}

/**
 * Restores previously saved highlights from localStorage.
 * Called on component mount to persist highlights across page reloads.
 */
function restoreHighlightedContent(content: Ref<HTMLElement | undefined>, contentId: string) {
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

function removeHighlightedText(content: Ref<HTMLElement | undefined>, contentId: string) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const marksToRemove: HTMLElement[] = [];

    // Check if the commonAncestorContainer itself or any of its parents is a MARK
    let node: Node | undefined = range.commonAncestorContainer;
    while (node && node !== content.value) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "MARK") {
            // Check if this mark intersects with the selection
            if (range.intersectsNode(node)) marksToRemove.push(node as HTMLElement);
        }
        node = node.parentNode as HTMLElement | undefined;
    }

    // Also search for mark elements within the selection range
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: (node) => {
                if ((node as HTMLElement).tagName === "MARK" && range.intersectsNode(node)) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            },
        },
    );

    let currentNode;
    while ((currentNode = walker.nextNode())) {
        // Avoid duplicates
        if (!marksToRemove.includes(currentNode as HTMLElement))
            marksToRemove.push(currentNode as HTMLElement);
    }

    // If no marks were found to remove, exit early
    if (marksToRemove.length === 0) {
        selection.removeAllRanges();
        showHighlightColors.value = false;
        return;
    }

    // Remove all found marks
    marksToRemove.forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize();
        }
    });

    selection.removeAllRanges();
    showHighlightColors.value = false;

    // Save the updated content (which now has the marks removed)
    saveHighlightedContent(content, contentId);
}

/**
 * Handle document-wide clicks to implement a click-outside pattern
 */
function onDocumentClick(event: MouseEvent | TouchEvent) {
    // Don't process if we just showed the menu (prevents immediate dismissal)
    if (justShownMenu.value) {
        justShownMenu.value = false;
        return;
    }

    if (!showActions.value) return;
    if (!actionsMenu.value) return;

    // If menu is shown and click is outside the menu, hide it
    if (!actionsMenu.value.contains(event.target as Node) && !isInteractingWithMenu.value) {
        showActions.value = false;
        showHighlightColors.value = false;
        // Clear the text selection when dismissing the menu
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
        }
    }

    // Reset the interaction flag
    isInteractingWithMenu.value = false;
}

/**
 * Handles pointer and touch input to show the actions menu.
 * Positions the menu near the cursor or last touch point.
 *
 * @param event - PointerEvent or TouchEvent from the interaction
 */
function onPointerUp(event: PointerEvent | TouchEvent, content: Ref<HTMLElement | undefined>) {
    if (!actionsMenu.value) return;

    // Reset the interaction flag when touching outside the menu
    if (!actionsMenu.value.contains(event.target as Node)) isInteractingWithMenu.value = false;

    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;

    if (selText && content.value) {
        const contentRect = content.value.getBoundingClientRect();

        // Try to position based on selection bounds first, fallback to event coordinates
        let menuX = 0;
        let menuY = 0;

        if (selection) {
            const range = selection.getRangeAt(0);
            const rangeRect = range.getBoundingClientRect();
            menuX = rangeRect.left - contentRect.left;
            menuY = rangeRect.bottom - contentRect.top + 4;
            // Fallback to event coordinates
            let clientX = 0;
            let clientY = 0;

            if (event instanceof PointerEvent) {
                clientX = event.clientX;
                clientY = event.clientY;
            } else if (event instanceof TouchEvent) {
                const touch = event.changedTouches[0];
                clientX = touch.clientX;
                clientY = touch.clientY;
            }

            menuX = clientX - contentRect.left;
            menuY = clientY - contentRect.top + 16;
        } else {
            // Fallback to event coordinates
            let clientX = 0;
            let clientY = 0;

            if (event instanceof PointerEvent) {
                clientX = event.clientX;
                clientY = event.clientY;
            } else if (event instanceof TouchEvent) {
                const touch = event.changedTouches[0];
                clientX = touch.clientX;
                clientY = touch.clientY;
            }

            menuX = clientX - contentRect.left;
            menuY = clientY - contentRect.top + 16;
        }

        // Adjust position to prevent clipping off screen
        const menuWidth = 200; // approximate width of menu
        const menuHeight = 100; // approximate height of menu
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust X to prevent right edge clipping
        const absoluteX = contentRect.left + menuX;
        const isClippingRight = absoluteX + menuWidth > viewportWidth;

        if (isClippingRight) menuX = viewportWidth - contentRect.left - menuWidth - 10; // 10px margin
        // Prevent left edge clipping
        if (menuX < 0) menuX = 10;

        // Adjust Y to prevent bottom clipping
        const absoluteY = contentRect.top + menuY;

        const isClippingBottom = absoluteY + menuHeight > viewportHeight;
        if (isClippingBottom) {
            // Position above the selection instead
            if (selection) {
                const range = selection.getRangeAt(0);
                const rangeRect = range.getBoundingClientRect();
                menuY = rangeRect.top - contentRect.top - menuHeight - 4;
                menuY = menuY - menuHeight - 20;
            }
        }
        // Prevent top clipping
        if (contentRect.top + menuY < 0) menuY = -contentRect.top + 10;

        showActions.value = true;
        justShownMenu.value = true;
        actionPosition.value = {
            x: menuX,
            y: menuY,
        };
    } else {
        if (!isInteractingWithMenu.value) {
            // Only hide if we're not interacting with the menu
            showActions.value = false;
            actionPosition.value = undefined;
        }
    }
}

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

// Wrapper functions to pass the content ref to event handlers
const handlePointerUp = (event: PointerEvent | TouchEvent) => onPointerUp(event, content);
const handleTouchEnd = (event: TouchEvent) => onTouchEnd(event, content);
const handleHighlightClick = (color: string) =>
    highlightSelectedText(color, content, props.contentId);

/**
 * Component lifecycle hooks
 */
onMounted(() => {
    // Register selection change listeners for showing/hiding actions menu
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("click", onDocumentClick);

    // Wait for slot content to render, then restore saved highlights
    setTimeout(() => {
        restoreHighlightedContent(content, props.contentId);
    }, 100);
});

onUnmounted(() => {
    // Clean up event listeners
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("click", onDocumentClick);

    // Clean up auto-scroll interval
    if (autoScrollInterval.value) {
        clearInterval(autoScrollInterval.value);
        autoScrollInterval.value = undefined;
    }

    // Clean up long press timer
    if (longPressTimer.value) {
        clearTimeout(longPressTimer.value);
        longPressTimer.value = undefined;
    }
});
</script>

<template>
    <div>
        <!-- Content container with pointer event handling -->
        <div class="relative" ref="content" @pointerup="handlePointerUp">
            <!-- Slot for the highlightable content -->
            <div
                class="select-text"
                style="
                    user-select: text !important;
                    -webkit-user-select: text !important;
                    -webkit-touch-callout: default !important;
                "
                @touchstart.passive="onTouchStart"
                @touchmove="onTouchMove"
                @touchend.passive="handleTouchEnd"
            >
                <slot></slot>
            </div>

            <!-- Actions menu (highlight/copy buttons) -->
            <div
                v-if="showActions"
                ref="actionsMenu"
                @pointerdown="onMenuPointerDown"
                @touchstart.passive="onMenuPointerDown"
                class="pointer-events-auto absolute z-[9999] flex w-max max-w-[calc(100vw-20px)] items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg"
                :style="{
                    left: actionPosition?.x + 'px',
                    top: actionPosition?.y + 'px',
                }"
            >
                <!-- Color picker palette (shown when highlight button clicked) -->
                <div v-if="showHighlightColors">
                    <button
                        @click="() => removeHighlightedText(content, props.contentId)"
                        aria-label="Remove highlight"
                    >
                        <MinusCircleIcon class="size-6 text-zinc-500" />
                        <span class="sr-only">Remove highlight</span>
                    </button>
                    <button
                        v-for="(c, name) in supportedColors"
                        class="m-1 h-6 w-6 rounded-full"
                        :key="name"
                        :style="{ backgroundColor: c }"
                        @click.prevent="handleHighlightClick(c)"
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
