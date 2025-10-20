<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { DocumentIcon, PencilIcon } from "@heroicons/vue/24/outline";
import { restoreHighlightedContent } from "./LHighlightable/highlight";
import { onDocumentClick, onPointerUp, onMenuPointerDown } from "./LHighlightable/events";
import {
    autoScrollInterval,
    longPressTimer,
    actionPosition,
    actionsMenu,
    showActions,
    showHighlightColors,
} from "./LHighlightable/shared";
import {
    handleSelectionChange,
    onSelectionChange,
    highlightSelectedText,
    copySelectedText,
} from "./LHighlightable/textSelection";
import { onTouchStart, onTouchEnd, onTouchMove } from "./LHighlightable/mobileEvents";

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
 * Component lifecycle hooks
 */
onMounted(() => {
    // Register selection change listeners for showing/hiding actions menu
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("click", onDocumentClick);
    // Don't listen to touchend on document level - it conflicts with our touch selection
    // document.addEventListener("touchend", onDocumentClick);

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
        <div class="relative" ref="content" @pointerup="onPointerUp">
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
                @touchend.passive="onTouchEnd"
            >
                <slot></slot>
            </div>
            showActions: {{ showActions }}, actionPosition: {{ actionPosition }}
            <!-- Debug info -->
            <div
                v-if="showActions || actionPosition"
                class="fixed right-0 top-0 z-[10000] bg-red-500 p-4 text-white"
            >
                showActions: {{ showActions }}, actionPosition: {{ actionPosition }}
            </div>

            <!-- Actions menu (highlight/copy buttons) -->
            <div
                v-if="showActions && actionPosition"
                ref="actionsMenu"
                @pointerdown="onMenuPointerDown"
                @touchstart.passive="onMenuPointerDown"
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
                        @click.prevent="highlightSelectedText(c, content, contentId)"
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
