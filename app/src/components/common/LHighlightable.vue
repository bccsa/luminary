<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { DocumentIcon, MinusCircleIcon, PencilIcon } from "@heroicons/vue/24/outline";
import { userPreferencesAsRef } from "@/globalConfig";

interface Props {
    contentId: string;
}

const props = defineProps<Props>();
const content = ref<HTMLElement | null>(null);
const actionsMenu = ref<HTMLElement | null>(null);

const selectedText = ref("");
const showActions = ref(false);
const actionPosition = ref<{ x: number; y: number } | null>(null);
const showHighlightColors = ref(false);

const MENU_WIDTH = 200;
const MENU_HEIGHT = 100;

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

function highlightTextInDOM(color: string, contentId: string) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !content.value) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    // Check if selection is within a single mark
    let node: Node | null = range.commonAncestorContainer;
    let foundMark: HTMLElement | null = null;
    while (node && node !== content.value) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "MARK") {
            foundMark = node as HTMLElement;
            break;
        }
        node = node.parentNode;
    }

    if (
        foundMark &&
        content.value.contains(foundMark) &&
        range.startContainer.parentNode === foundMark &&
        range.endContainer.parentNode === foundMark
    ) {
        updateMarkColor(foundMark, color);
        selection.removeAllRanges();
        saveHighlightedContent(contentId);
        return;
    }

    // Simple case: single text node
    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        if (!content.value.contains(startContainer)) return;
        const textNode = startContainer as Text;
        const parentMark = getParentMark(textNode, content.value);
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
        saveHighlightedContent(contentId);
        return;
    }

    // Complex case: multi-node selection
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
            range.intersectsNode(node) && content.value && content.value.contains(node)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
    });

    const textNodes: Node[] = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode);
    }

    textNodes.forEach((textNode) => {
        if (textNode.nodeType !== Node.TEXT_NODE) return;
        const text = textNode.textContent || "";
        let start = 0;
        let end = text.length;
        if (textNode === range.startContainer) start = range.startOffset;
        if (textNode === range.endContainer) end = range.endOffset;
        if (start >= end) return;

        const parentMark = getParentMark(textNode, content.value);
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
    saveHighlightedContent(contentId);
}

function saveHighlightedContent(contentId: string) {
    if (!userPreferencesAsRef.value.highlights) userPreferencesAsRef.value.highlights = {};
    if (content.value) {
        const slotContent = content.value.querySelector(".prose");
        if (slotContent) {
            const html = slotContent.innerHTML;
            if (html.includes("<mark")) {
                userPreferencesAsRef.value.highlights[contentId] = [
                    { html, color: "rgba(255, 255, 0, 0.3)" },
                ];
            } else {
                delete userPreferencesAsRef.value.highlights[contentId];
            }
            localStorage.setItem("userPreferences", JSON.stringify(userPreferencesAsRef.value));
        }
    }
}

function restoreHighlightedContent(contentId: string) {
    const highlights = userPreferencesAsRef.value.highlights?.[contentId] || [];
    if (highlights.length && content.value) {
        const slotContent = content.value.querySelector(".prose");
        if (slotContent) {
            slotContent.innerHTML = highlights[0].html;
        }
    }
}

function removeHighlightedText(contentId: string) {
    if (!content.value) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const marksToRemove: HTMLElement[] = [];
    let node: Node | null = range.commonAncestorContainer;
    while (node && node !== content.value) {
        if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node as HTMLElement).tagName === "MARK" &&
            content.value.contains(node)
        ) {
            marksToRemove.push(node as HTMLElement);
        }
        node = node.parentNode;
    }

    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: (node) =>
                (node as HTMLElement).tagName === "MARK" &&
                range.intersectsNode(node) &&
                content.value &&
                content.value.contains(node)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT,
        },
    );

    let currentNode;
    while ((currentNode = walker.nextNode())) {
        if (!marksToRemove.includes(currentNode as HTMLElement)) {
            marksToRemove.push(currentNode as HTMLElement);
        }
    }

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
    saveHighlightedContent(contentId);
}

async function copySelectedText() {
    const selection = window.getSelection();
    const text = selection?.toString() || "";
    if (text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy text:", err);
        }
    }
    showActions.value = false;
    selection?.removeAllRanges();
}

function positionMenu(clientX: number, clientY: number, range?: Range) {
    if (!content.value) return;
    const contentRect = content.value.getBoundingClientRect();
    let menuX = clientX - contentRect.left;
    let menuY = range
        ? range.getBoundingClientRect().bottom - contentRect.top + 4
        : clientY - contentRect.top + 16;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const absoluteX = contentRect.left + menuX;
    if (absoluteX + MENU_WIDTH > viewportWidth) {
        menuX = viewportWidth - contentRect.left - MENU_WIDTH - 10;
    }
    if (menuX < 0) menuX = 10;

    const absoluteY = contentRect.top + menuY;
    if (absoluteY + MENU_HEIGHT > viewportHeight) {
        menuY =
            (range ? range.getBoundingClientRect().top - contentRect.top : menuY) -
            MENU_HEIGHT -
            20;
    }
    if (contentRect.top + menuY < 0) menuY = -contentRect.top + 10;

    actionPosition.value = { x: menuX, y: menuY };
    showActions.value = true;
}

function handleSelectionEnd() {
    // Small timeout to ensure selection is complete
    setTimeout(() => {
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
            showActions.value = false;
            showHighlightColors.value = false;
            return;
        }

        const range = selection.getRangeAt(0);
        if (!content.value?.contains(range.commonAncestorContainer)) {
            return;
        }

        selectedText.value = selection.toString();

        // Position menu at the end of the selection
        const rects = range.getClientRects();
        if (rects.length > 0) {
            const lastRect = rects[rects.length - 1];
            positionMenu(lastRect.right, lastRect.bottom, range);
        }
    }, 10);
}

function handleSelectionChange() {
    const selection = window.getSelection();

    // Hide actions if no selection
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
        showActions.value = false;
        showHighlightColors.value = false;
    }
}

// Handle clicks outside to close menus
function handleClickOutside(event: MouseEvent) {
    if (actionsMenu.value && !actionsMenu.value.contains(event.target as Node)) {
        const selection = window.getSelection();
        if (!selection?.toString().trim()) {
            showActions.value = false;
            showHighlightColors.value = false;
        }
    }
}

onMounted(() => {
    setTimeout(() => restoreHighlightedContent(props.contentId), 100);

    // Listen for selection changes (for clearing)
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
    <div class="relative" ref="content">
        <div
            class="select-text"
            style="
                user-select: text !important;
                -webkit-user-select: text !important;
                -webkit-touch-callout: none !important;
            "
            @mouseup="handleSelectionEnd"
            @touchend="handleSelectionEnd"
        >
            <slot></slot>
        </div>

        <div
            v-if="showActions"
            ref="actionsMenu"
            class="pointer-events-auto absolute z-[9999] flex w-max max-w-[calc(100vw-20px)] items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg"
            :style="{ left: actionPosition?.x + 'px', top: actionPosition?.y + 'px' }"
        >
            <div v-if="showHighlightColors" class="flex gap-1">
                <button
                    @click="removeHighlightedText(props.contentId)"
                    aria-label="Remove highlight"
                >
                    <MinusCircleIcon class="size-6 text-zinc-500" />
                    <span class="sr-only">Remove highlight</span>
                </button>
                <button
                    v-for="(color, name) in supportedColors"
                    :key="name"
                    class="m-1 h-6 w-6 rounded-full"
                    :style="{ backgroundColor: color }"
                    @click="highlightTextInDOM(color, props.contentId)"
                    :aria-label="`Highlight with ${name} color`"
                ></button>
            </div>
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
</template>
