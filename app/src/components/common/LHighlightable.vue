<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { DocumentIcon, PencilIcon, PencilSquareIcon } from "@heroicons/vue/24/outline";

const highlights = ref<{ text: string }[]>([]);
const content = ref<HTMLElement | null>(null);

const showActions = ref(false);
const actionPosition = ref<{ x: number; y: number } | null>(null);
const selectedText = ref("");

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

function highlightTextInDOM(color: string = "rgba(255, 255, 0, 0.3)") {
    // Use Range API to wrap only the selected text
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        // Simple case: selection within one text node
        const textNode = startContainer as Text;
        const text = textNode.textContent || "";
        const before = text.slice(0, startOffset);
        const selected = text.slice(startOffset, endOffset);
        const after = text.slice(endOffset);

        const mark = document.createElement("mark");
        mark.style.backgroundColor = color;
        mark.style.fontWeight = "unset";
        mark.style.color = "unset";
        mark.textContent = selected;

        const parent = textNode.parentNode;
        if (parent) {
            if (before) {
                const beforeNode = document.createTextNode(before);
                parent.insertBefore(beforeNode, textNode);
            }
            parent.insertBefore(mark, textNode);
            if (after) {
                const afterNode = document.createTextNode(after);
                parent.insertBefore(afterNode, textNode);
            }
            parent.removeChild(textNode);
        }
    } else {
        // Complex case: selection across multiple nodes
        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const nodeRange = document.createRange();
                    nodeRange.selectNodeContents(node);
                    return range.intersectsNode(node)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            },
        );

        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            textNodes.push(node);
        }

        // Process each intersecting text node
        for (const textNode of textNodes) {
            const text = textNode.textContent || "";
            let start = 0;
            let end = text.length;
            if (textNode === startContainer) {
                start = startOffset;
            }
            if (textNode === endContainer) {
                end = endOffset;
            }

            const before = text.slice(0, start);
            const selected = text.slice(start, end);
            const after = text.slice(end);

            const mark = document.createElement("mark");
            mark.style.backgroundColor = color;
            mark.style.fontWeight = "unset";
            mark.style.color = "unset";
            mark.textContent = selected;

            const parent = textNode.parentNode;
            if (parent) {
                if (before) {
                    const beforeNode = document.createTextNode(before);
                    parent.insertBefore(beforeNode, textNode);
                }
                parent.insertBefore(mark, textNode);
                if (after) {
                    const afterNode = document.createTextNode(after);
                    parent.insertBefore(afterNode, textNode);
                }
                parent.removeChild(textNode);
            }
        }
    }

    // Clear selection
    selection.removeAllRanges();
}

function highlightSelectedText(color: string) {
    highlightTextInDOM(color);
    showHighlightColors.value = false;
    selectedText.value = "";
    showActions.value = false;
}

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
    // Hide actions after copy
    showActions.value = false;
}

function onPointerUp(event: PointerEvent) {
    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
    if (selText && content.value) {
        const rect = content.value.getBoundingClientRect();
        showActions.value = true;
        // Handle both mouse and touch coordinates (pointer events unify them)
        const clientX = event.clientX;
        const clientY = event.clientY;
        actionPosition.value = {
            x: clientX - rect.left,
            // add a slightly larger vertical offset so the menu appears below the cursor/selection
            y: clientY - rect.top,
        };
    } else {
        showActions.value = false;
        actionPosition.value = null;
    }
}

// Re-apply highlights when highlights array changes
watch(
    () => highlights.value.length,
    () => {
        nextTick(() => {
            highlightTextInDOM();
        });
    },
);

const showHighlightColors = ref(false);

// Add a global selection change listener to handle external text selections
function handleSelectionChange() {
    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
}

function onSelectionChange() {
    const selection = window.getSelection();
    if (!selection) return;
    const selText = selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
    if (selText && content.value) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const contentRect = content.value.getBoundingClientRect();
        showActions.value = true;
        actionPosition.value = {
            x: rect.left - contentRect.left,
            y: rect.top - contentRect.top - 60,
        };
    } else {
        showActions.value = false;
        actionPosition.value = null;
    }
}

// Register the selection change listener on mount
onMounted(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("selectionchange", onSelectionChange);
});

// Unregister the selection change listener on unmount
onUnmounted(() => {
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener("selectionchange", onSelectionChange);
});
</script>

<template>
    <div>
        <!-- Sample text content -->
        <div class="relative" ref="content" @pointerup="onPointerUp">
            <slot></slot>
            <div
                v-if="showActions && actionPosition"
                class="pointer-events-auto absolute flex w-max max-w-[calc(100vw-20px)] items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg"
                :style="{
                    left: actionPosition.x + 'px',
                    top: actionPosition.y + 'px',
                    zIndex: 9999,
                }"
            >
                <div v-if="showHighlightColors">
                    <button
                        v-for="(c, name) in supportedColors"
                        class="m-1 h-6 w-6 gap-1 rounded-full"
                        :key="name"
                        :style="{ backgroundColor: c }"
                        @click.prevent="highlightSelectedText(c)"
                    ></button>
                </div>
                <div class="flex size-max gap-1 divide-x" v-else>
                    <button
                        class="flex size-10 w-max flex-col items-center justify-center gap-1 px-2"
                        @click="showHighlightColors = true"
                    >
                        <PencilSquareIcon class="size-10" />
                        <span class="text-xs">Notes</span>
                    </button>
                    <button
                        class="flex size-10 w-max flex-col items-center justify-center gap-1 px-2"
                        @click="showHighlightColors = true"
                    >
                        <PencilIcon class="size-10" />
                        <span class="text-xs">Highlight</span>
                    </button>
                    <button
                        class="flex size-10 w-max flex-col items-center justify-center gap-1 px-2"
                        @click="copySelectedText"
                    >
                        <DocumentIcon class="size-10" />
                        <span class="text-xs">Copy</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<!-- <style scoped>
/* Make the color input match the round buttons but with an input-like border */
input[type="color"] {
    -webkit-appearance: none;
    appearance: none;

    padding: 0;
    margin: 0;
    border-radius: 9999px;
    border: 1px solid rgba(15, 23, 42, 0.06); /* subtle input border */
    box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.15),
        0 1px 2px rgba(2, 6, 23, 0.04);
    cursor: pointer;
    display: inline-block;
}

/* Remove the default square swatch in WebKit and make the swatch circular */
input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
    border-radius: 9999px;
}
input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 9999px;
    box-shadow: inset 0 0 0 4px rgba(0, 0, 0, 0.04);
}

/* Firefox */
input[type="color"]::-moz-color-swatch {
    border: none;
    border-radius: 9999px;
}

/* Focus styles to look like an input */
input[type="color"]:focus {
    outline: none;
    box-shadow:
        0 0 0 3px rgba(250, 204, 21, 0.12),
        0 1px 2px rgba(2, 6, 23, 0.06);
    border-color: rgba(250, 204, 21, 0.35);
}

/* Slight visual difference: color-input has a subtle inner swatch using background-image */
.color-input {
    border-radius: 6px;
    background-image: linear-gradient(transparent, transparent);
}

/* Rainbow ring wrapper */
.color-input-wrapper {
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    padding: 1px; /* thinner ring thickness */
    /* remove the bright yellow center stop so there's no strong yellow in the middle */
    background: conic-gradient(red, orange, green, cyan, blue, violet, red);
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.color-input-wrapper .color-input {
    width: 12px;
    height: 12px;
    border-radius: 9999px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    box-shadow: none;
} -->
<!-- </style> -->
