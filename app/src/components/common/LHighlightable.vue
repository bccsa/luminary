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

    // Create a <mark> element
    const mark = document.createElement("mark");
    const toRgba = (c: string, defaultAlpha = 0.3) => {
        const s = (c || "").trim();

        // Already rgba(...)
        if (/^rgba\(/i.test(s)) return s;

        // rgb(...) -> rgba(...)
        if (/^rgb\(/i.test(s)) {
            const nums = s.match(/\d+(\.\d+)?/g) || [];
            const [r, g, b] = nums;
            return `rgba(${r}, ${g}, ${b}, ${defaultAlpha})`;
        }

        // Hex formats
        if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) {
            let hex = s.slice(1);
            // Expand short forms
            if (hex.length === 3 || hex.length === 4) {
                hex = hex
                    .split("")
                    .map((ch) => ch + ch)
                    .join("");
            }
            if (hex.length === 8) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                const a = parseInt(hex.slice(6, 8), 16) / 255;
                return `rgba(${r}, ${g}, ${b}, ${a})`;
            }
            if (hex.length === 6) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, ${defaultAlpha})`;
            }
        }

        // Named colors or other formats -> resolve and convert
        const tmp = document.createElement("div");
        tmp.style.backgroundColor = s;
        document.body.appendChild(tmp);
        const resolved = getComputedStyle(tmp).backgroundColor;
        document.body.removeChild(tmp);

        if (/^rgba\(/i.test(resolved)) return resolved;
        const nums = resolved.match(/\d+(\.\d+)?/g) || [];
        if (nums.length >= 3) {
            const [r, g, b] = nums;
            return `rgba(${r}, ${g}, ${b}, ${defaultAlpha})`;
        }

        return s;
    };

    mark.style.backgroundColor = toRgba(color, 0.3);
    mark.style.color = "black";
    mark.style.fontWeight = "bold";
    mark.appendChild(range.extractContents());
    range.insertNode(mark);

    // Clear selection
    selection.removeAllRanges();
}

function highlightSelectedText(color: string) {
    highlightTextInDOM(color);
    showHighlightColors.value = false;
    selectedText.value = "";
    showActions.value = false;
}

function onPointerUp(event: PointerEvent) {
    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
    if (selText && content.value) {
        const rect = content.value.getBoundingClientRect();
        showActions.value = true;
        // Handle both mouse and touch coordinates
        const clientX = event.clientX || (event.touches && event.touches[0]?.clientX) || 0;
        const clientY = event.clientY || (event.touches && event.touches[0]?.clientY) || 0;
        actionPosition.value = {
            x: clientX - rect.left,
            // add a slightly larger vertical offset so the menu appears below the cursor/selection
            y: clientY - rect.top + 16,
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
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
    if (!selText) {
        showActions.value = false;
        actionPosition.value = null;
    }
}

// Register the selection change listener on mount
onMounted(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener('selectionchange', onSelectionChange);
});

// Unregister the selection change listener on unmount
onUnmounted(() => {
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener('selectionchange', onSelectionChange);
});
</script>

<template>
    <div>
        <!-- Sample text content -->
        <div class="relative" ref="content" @pointerup="onPointerUp">
            <slot></slot>
            <div
                v-if="showActions && actionPosition"
                class="pointer-events-auto absolute flex w-max items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg max-w-[calc(100vw-20px)]"
                :style="{
                    left: actionPosition.x + 'px',
                    top: actionPosition.y + 'px',
                    zIndex: 1000,
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
                        @click="showHighlightColors = true"
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
