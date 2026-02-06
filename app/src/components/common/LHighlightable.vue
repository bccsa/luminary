<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import {
    DocumentDuplicateIcon,
    PencilSquareIcon,
    TrashIcon,
    ChevronLeftIcon,
} from "@heroicons/vue/24/outline";
import { db } from "luminary-shared";

const props = defineProps<{ contentId: string }>();

const content = ref<HTMLElement | undefined>(undefined);
const actionsMenu = ref<HTMLElement | undefined>(undefined);
const showActions = ref(false);
const menuPos = ref({ x: 0, y: 0 });
const isHighlighted = ref(false);
const showColorPicker = ref(false);

let debounceTimeout: ReturnType<typeof setTimeout> | undefined;

const colors = {
    yellow: "rgba(253, 224, 71, 0.5)",
    green: "rgba(74, 222, 128, 0.5)",
    blue: "rgba(96, 165, 250, 0.5)",
    pink: "rgba(244, 114, 182, 0.5)",
    purple: "rgba(192, 132, 252, 0.5)",
};

// Selection Logic

function getSelectionRect(): DOMRect | undefined {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return undefined;

    const range = sel.getRangeAt(0);
    // Ensure selection is within our content
    if (!content.value?.contains(range.commonAncestorContainer)) return undefined;

    const rect = range.getBoundingClientRect();
    return rect.width > 0 ? rect : undefined;
}

function onSelectionChange() {
    // Hide menu immediately when selection starts changing to prevent jitter
    showActions.value = false;
    showColorPicker.value = false;

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        updateMenuState();
    }, 250); // Wait for selection to settle
}

function updateMenuState() {
    const rect = getSelectionRect();

    if (rect) {
        checkIfHighlighted();
        // Center menu above the selection
        menuPos.value = {
            x: rect.left + rect.width / 2,
            y: rect.top - 8,
        };
        showActions.value = true;
    } else {
        const sel = window.getSelection();
        // Only hide if selection is truly gone or outside our content
        if (!sel || sel.isCollapsed || !content.value?.contains(sel.anchorNode)) {
            showActions.value = false;
            showColorPicker.value = false;
        }
    }
}

function checkIfHighlighted() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        isHighlighted.value = false;
        return;
    }

    const range = sel.getRangeAt(0);
    // Check if the start of the selection is inside a mark
    let node: Node | undefined = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement ?? undefined;
    isHighlighted.value = !!(node as Element | undefined)?.closest?.("mark");
}
// Highlighting (Recursive Safe Method)

function wrapTextNodes(range: Range, color: string) {
    // Capture range details before any DOM mutations
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    const nodes: Text[] = [];

    // If the common ancestor is a text node, the selection is fully contained within it
    if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
        nodes.push(range.commonAncestorContainer as Text);
    } else {
        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    // Robust check: if node intersects the range, we accept it.
                    // This handles cases where start/end containers are Elements or Text nodes.
                    return range.intersectsNode(node)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            },
        );

        while (walker.nextNode()) {
            nodes.push(walker.currentNode as Text);
        }
    }

    // Helper to wrap a node with the highlight color
    const wrap = (n: Text, c: string) => {
        if (!n.nodeValue?.trim()) return;
        const mark = document.createElement("mark");
        mark.style.backgroundColor = c;
        mark.className = "rounded-sm px-0.5 box-decoration-clone";
        n.parentNode?.insertBefore(mark, n);
        mark.appendChild(n);
    };

    nodes.forEach((node) => {
        //  Handle Start Node
        if (node === startNode) {
            if (node === endNode) {
                // Selection is within a single text node
                const part = node.splitText(startOffset);
                part.splitText(endOffset - startOffset);
                wrap(part, color);
            } else {
                // Start of multi-node selection
                // splitText returns the new node (the right part), which is the part selected
                const part = node.splitText(startOffset);
                wrap(part, color);
            }
        }
        // Handle End Node
        else if (node === endNode) {
            // End of multi-node selection
            // splitText at endOffset. The left part (original node) is what we want.
            node.splitText(endOffset);
            wrap(node, color);
        }
        // Handle Intermediate Nodes
        else {
            wrap(node, color);
        }
    });

    finalizeHighlight();
}

function finalizeHighlight() {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    // Save highlights asynchronously (fire-and-forget)
    void saveHighlights();
    showActions.value = false;
    showColorPicker.value = false;
}

function applyColor(color: string) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        wrapTextNodes(sel.getRangeAt(0), color);
    }
}

function removeHighlight() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    // Find all marks intersecting the range
    const marks = document.querySelectorAll("mark");
    const marksToProcess: HTMLElement[] = [];

    marks.forEach((mark) => {
        if (range.intersectsNode(mark) && content.value?.contains(mark)) {
            marksToProcess.push(mark);
        }
    });

    // Also check ancestor
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) container = container.parentElement as Element;
    const ancestorMark = (container as Element).closest("mark");
    if (ancestorMark && !marksToProcess.includes(ancestorMark)) marksToProcess.push(ancestorMark);

    marksToProcess.forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;

        // Get the mark's text content and position info
        const markText = mark.textContent || "";

        // Check if selection is entirely within this mark (partial removal)
        const markContainsStart = mark.contains(startContainer);
        const markContainsEnd = mark.contains(endContainer);

        if (markContainsStart && markContainsEnd && markText.length > 0) {
            // Calculate the actual offsets within the mark's text
            let selStart = 0;
            let selEnd = markText.length;

            // For single text node inside mark
            if (mark.childNodes.length === 1 && mark.firstChild?.nodeType === Node.TEXT_NODE) {
                selStart = startOffset;
                selEnd = endOffset;
            } else {
                // For more complex cases, calculate offset by walking the tree
                const walker = document.createTreeWalker(mark, NodeFilter.SHOW_TEXT);
                let currentOffset = 0;

                while (walker.nextNode()) {
                    const textNode = walker.currentNode as Text;
                    const nodeLength = textNode.length;

                    if (textNode === startContainer) {
                        selStart = currentOffset + startOffset;
                    }
                    if (textNode === endContainer) {
                        selEnd = currentOffset + endOffset;
                    }
                    currentOffset += nodeLength;
                }
            }

            // Get the parts
            const beforeText = markText.substring(0, selStart);
            const selectedText = markText.substring(selStart, selEnd);
            const afterText = markText.substring(selEnd);

            const markColor = mark.style.backgroundColor;
            const markClass = mark.className;

            // Clear mark and rebuild
            mark.textContent = "";

            // Create "before" part (still highlighted)
            if (beforeText) {
                const beforeMark = document.createElement("mark");
                beforeMark.style.backgroundColor = markColor;
                beforeMark.className = markClass;
                beforeMark.textContent = beforeText;
                parent.insertBefore(beforeMark, mark);
            }

            // Insert unhighlighted selected text
            if (selectedText) {
                const plainText = document.createTextNode(selectedText);
                parent.insertBefore(plainText, mark);
            }

            // Create "after" part (still highlighted)
            if (afterText) {
                const afterMark = document.createElement("mark");
                afterMark.style.backgroundColor = markColor;
                afterMark.className = markClass;
                afterMark.textContent = afterText;
                parent.insertBefore(afterMark, mark);
            }

            // Remove the original empty mark
            parent.removeChild(mark);
            parent.normalize();
        } else {
            // Full removal - original behavior
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize();
        }
    });

    finalizeHighlight();
}

function copyText() {
    const sel = window.getSelection();
    if (sel) {
        navigator.clipboard.writeText(sel.toString());
        showActions.value = false;
        sel.removeAllRanges();
    }
}

// Persistence

/**
 * Saves highlights to IndexedDB using the luminaryInternals table.
 * Stores the HTML content with highlights for the current content ID.
 */
async function saveHighlights() {
    const prose = content.value?.querySelector(".prose");
    if (!prose) return;

    const html = prose.innerHTML;

    try {
        // Get existing highlights data from IndexedDB
        const existingData = (await db.getLuminaryInternals("highlights")) || {};
        const data = typeof existingData === "object" && existingData !== null ? existingData : {};

        if (html.includes("<mark")) {
            data[props.contentId] = html;
        } else {
            delete data[props.contentId];
        }

        // Save to IndexedDB
        await db.setLuminaryInternals("highlights", data);
    } catch (error) {
        console.error("Failed to save highlights to IndexedDB:", error);
    }
}

/**
 * Restores highlights from IndexedDB using the luminaryInternals table.
 * Loads the saved HTML content with highlights for the current content ID.
 */
async function restoreHighlights() {
    try {
        const data = (await db.getLuminaryInternals("highlights")) || {};
        const saved = typeof data === "object" && data !== null ? data[props.contentId] : undefined;

        if (saved && content.value) {
            const prose = content.value.querySelector(".prose");
            if (prose) prose.innerHTML = saved;
        }
    } catch (error) {
        console.error("Failed to restore highlights from IndexedDB:", error);
    }
}

// Prevent iOS Native Menu

let touchTimer: ReturnType<typeof setTimeout> | undefined = undefined;

function handleTouchStart() {
    // Clear any existing timer
    if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = undefined;
    }

    // Set a timer to detect long-press
    touchTimer = setTimeout(() => {
        // After long-press duration, check if there's a selection
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            // Force our menu to show and prevent native behavior
            updateMenuState();
        }
    }, 400);
}

function handleTouchEnd() {
    // Clear the timer
    if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = undefined;
    }
}

function handleContextMenu(e: Event) {
    // Prevent native context menu on all platforms (especially iOS)
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
}

function handleSelectStart() {
    // Selection has started - context menu will be handled by our component
}

function handleTouchCancel() {
    // Clear timer on touch cancel
    if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = undefined;
    }
}

// Intercept any attempts to show native menus at the document level
function documentContextMenuHandler(e: Event) {
    if (content.value?.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}

onMounted(async () => {
    await restoreHighlights();
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", onSelectionChange, { passive: true });

    // Add document-level context menu prevention for iOS
    document.addEventListener("contextmenu", documentContextMenuHandler, { capture: true });

    // Add selectstart listener to track when selection begins
    content.value?.addEventListener("selectstart", handleSelectStart);
});

onUnmounted(() => {
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("scroll", onSelectionChange);
    document.removeEventListener("contextmenu", documentContextMenuHandler, { capture: true });
    content.value?.removeEventListener("selectstart", handleSelectStart);

    if (touchTimer) {
        clearTimeout(touchTimer);
    }
});
</script>

<template>
    <div
        ref="content"
        class="no-native-menu relative"
        @contextmenu.capture.prevent.stop="handleContextMenu"
        @touchstart="handleTouchStart"
        @touchend.passive="handleTouchEnd"
        @touchcancel.passive="handleTouchCancel"
    >
        <!-- Content Container -->
        <div class="prose max-w-none select-text">
            <slot />
        </div>

        <!-- Action Menu -->
        <teleport to="body">
            <div
                v-if="showActions"
                ref="actionsMenu"
                class="fixed z-50 flex -translate-x-1/2 -translate-y-full flex-col items-center rounded-lg bg-white p-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-slate-700 dark:ring-slate-500"
                :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }"
                @mousedown.stop.prevent
            >
                <!-- Main Menu -->
                <div v-if="!showColorPicker" class="flex items-center gap-1">
                    <!-- Highlight Toggle -->
                    <button
                        @click="isHighlighted ? removeHighlight() : (showColorPicker = true)"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500"
                    >
                        <component
                            :is="isHighlighted ? TrashIcon : PencilSquareIcon"
                            class="size-4"
                        />
                        {{ isHighlighted ? "Remove" : "Highlight" }}
                    </button>

                    <div class="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-slate-500"></div>

                    <!-- Copy -->
                    <button
                        @click="copyText"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500"
                    >
                        <DocumentDuplicateIcon class="size-4" />
                        Copy
                    </button>
                </div>

                <!-- Color Picker -->
                <div v-else class="flex items-center gap-2 p-1">
                    <button
                        @click="showColorPicker = false"
                        class="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                        <ChevronLeftIcon class="size-5" />
                    </button>

                    <div class="flex gap-2">
                        <button
                            v-for="(color, name) in colors"
                            :key="name"
                            class="size-6 rounded-full ring-1 ring-zinc-200 transition-transform hover:scale-110 dark:ring-slate-400"
                            :style="{ backgroundColor: color }"
                            @click="applyColor(color)"
                        ></button>
                    </div>
                </div>

                <!-- Arrow -->
                <div
                    class="absolute bottom-0 left-1/2 -mb-1.5 -ml-1.5 h-3 w-3 -rotate-45 border-b border-l border-zinc-200 bg-white dark:border-slate-500 dark:bg-slate-700"
                ></div>
            </div>
        </teleport>
    </div>
</template>

<style scoped>
/* Ensure mark styling is consistent */
:deep(mark) {
    color: inherit;
    padding: 0.1em 0;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
}

/* Ensure native selection is visible */
.prose ::selection {
    background-color: rgba(59, 130, 246, 0.3);
    color: inherit;
}

/* Prevent iOS native selection menu and callout - aggressive approach */
.no-native-menu,
.no-native-menu * {
    /* Disable iOS callout menu (Copy, Look Up, etc.) */
    -webkit-touch-callout: none !important;
    /* Allow text selection */
    -webkit-user-select: text !important;
    user-select: text !important;
    /* Remove tap highlight */
    -webkit-tap-highlight-color: transparent !important;
    /* Disable drag */
    -webkit-user-drag: none !important;
}

/* Additional iOS-specific fixes */
.no-native-menu {
    /* Ensure touch-action doesn't interfere with selection */
    touch-action: pan-x pan-y;
}

.prose {
    /* Hides native menu/magnifier on iOS */
    -webkit-touch-callout: none !important;
    /* Allow text selection but prevent native menu */
    -webkit-user-select: text !important;
    user-select: text !important;
    /* Ensure the prose content behaves correctly */
    position: relative;
}

/* Target iOS Safari specifically using feature queries */
@supports (-webkit-touch-callout: none) {
    .no-native-menu,
    .no-native-menu *,
    .prose,
    .prose * {
        -webkit-touch-callout: none !important;
    }
}
</style>
