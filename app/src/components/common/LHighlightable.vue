<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import {
    DocumentDuplicateIcon,
    PencilSquareIcon,
    TrashIcon,
    ChevronLeftIcon,
} from "@heroicons/vue/24/outline";

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
    saveHighlights();
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
    // Find all marks intersecting the range
    const marks = document.querySelectorAll("mark");
    const marksToRemove: HTMLElement[] = [];

    marks.forEach((mark) => {
        if (range.intersectsNode(mark) && content.value?.contains(mark)) {
            marksToRemove.push(mark);
        }
    });

    // Also check ancestor
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) container = container.parentElement as Element;
    const ancestorMark = (container as Element).closest("mark");
    if (ancestorMark && !marksToRemove.includes(ancestorMark)) marksToRemove.push(ancestorMark);

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

function saveHighlights() {
    const prose = content.value?.querySelector(".prose");
    if (!prose) return;

    const html = prose.innerHTML;
    const data = JSON.parse(localStorage.getItem("highlights") || "{}");

    if (html.includes("<mark")) {
        data[props.contentId] = html;
    } else {
        delete data[props.contentId];
    }

    localStorage.setItem("highlights", JSON.stringify(data));
}

function restoreHighlights() {
    const data = JSON.parse(localStorage.getItem("highlights") || "{}");
    const saved = data[props.contentId];
    if (saved && content.value) {
        const prose = content.value.querySelector(".prose");
        if (prose) prose.innerHTML = saved;
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

    // Set a timer to prevent long-press menu (iOS shows menu after ~500ms)
    touchTimer = setTimeout(() => {
        // If touch is still active after 400ms, prevent the default to block menu
        // But we need to be careful not to break text selection
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            // If there's a selection, we want to prevent the menu
            // but we can't preventDefault here as it would break selection
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
    return false;
}

function handleTouchCancel() {
    // Clear timer on touch cancel
    if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = undefined;
    }
}

onMounted(() => {
    restoreHighlights();
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", onSelectionChange, { passive: true });
});

onUnmounted(() => {
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("scroll", onSelectionChange);

    if (touchTimer) {
        clearTimeout(touchTimer);
    }
});
</script>

<template>
    <div
        ref="content"
        class="no-native-menu relative"
        @contextmenu.prevent="handleContextMenu"
        @touchstart.passive="handleTouchStart"
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
                class="fixed z-50 flex -translate-x-1/2 -translate-y-full flex-col items-center rounded-lg bg-white p-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700"
                :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }"
                @mousedown.stop.prevent
            >
                <!-- Main Menu -->
                <div v-if="!showColorPicker" class="flex items-center gap-1">
                    <!-- Highlight Toggle -->
                    <button
                        @click="isHighlighted ? removeHighlight() : (showColorPicker = true)"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
                    >
                        <component
                            :is="isHighlighted ? TrashIcon : PencilSquareIcon"
                            class="size-4"
                        />
                        {{ isHighlighted ? "Remove" : "Highlight" }}
                    </button>

                    <div class="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-700"></div>

                    <!-- Copy -->
                    <button
                        @click="copyText"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-700 dark:active:bg-zinc-600"
                    >
                        <DocumentDuplicateIcon class="size-4" />
                        Copy
                    </button>
                </div>

                <!-- Color Picker -->
                <div v-else class="flex items-center gap-2 p-1">
                    <button
                        @click="showColorPicker = false"
                        class="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    >
                        <ChevronLeftIcon class="size-5" />
                    </button>

                    <div class="flex gap-2">
                        <button
                            v-for="(color, name) in colors"
                            :key="name"
                            class="size-6 rounded-full ring-1 ring-zinc-200 transition-transform hover:scale-110 dark:ring-zinc-600"
                            :style="{ backgroundColor: color }"
                            @click="applyColor(color)"
                        ></button>
                    </div>
                </div>

                <!-- Arrow -->
                <div
                    class="absolute bottom-0 left-1/2 -mb-1.5 -ml-1.5 h-3 w-3 -rotate-45 border-b border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
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

/* Prevent iOS native selection menu and callout */
.no-native-menu,
.no-native-menu * {
    /* Disable iOS callout menu (Copy, Look Up, etc.) */
    -webkit-touch-callout: none !important;
    /* Disable text selection menu on iOS Safari */
    -webkit-user-select: text;
    user-select: text;
    /* Prevent context menu */
    -webkit-tap-highlight-color: transparent;
}

/* Additional iOS-specific fixes */
.no-native-menu {
    /* Prevent iOS from showing the native selection menu */
    -webkit-user-drag: none;
    /* Ensure text can still be selected */
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}

.prose {
    /* Hides native menu/magnifier on iOS */
    -webkit-touch-callout: none !important;
    /* Allow text selection but prevent native menu */
    -webkit-user-select: text;
    user-select: text;
}
</style>
