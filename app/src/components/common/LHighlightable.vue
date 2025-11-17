<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { DocumentIcon, MinusCircleIcon, PencilIcon } from "@heroicons/vue/24/outline";

const props = defineProps<{ contentId: string }>();

const content = ref<HTMLElement | null>(null);
const actionsMenu = ref<HTMLElement | null>(null);

const showActions = ref(false);
const showColors = ref(false);
const menuPos = ref({ x: 0, y: 0 });

let isUsingCustomMenu = false;

const colors = {
    yellow: "rgba(255,255,0,0.3)",
    green: "rgba(0,255,0,0.3)",
    blue: "rgba(0,255,255,0.3)",
    pink: "rgba(255,192,203,0.3)",
    orange: "rgba(255,165,0,0.3)",
    purple: "rgba(128,0,128,0.3)",
};

function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    return rect.height <= 1 || rect.width <= 1 ? null : rect;
}

function updateMenu() {
    if (isUsingCustomMenu) return;

    nextTick(() => {
        const rect = getSelectionRect();
        const sel = window.getSelection();

        const hasValidSelection =
            sel && !sel.isCollapsed && rect && content.value?.contains(sel.anchorNode);

        if (hasValidSelection && rect) {
            menuPos.value = { x: rect.left + rect.width / 2, y: rect.top - 12 };
            showActions.value = true;
            showColors.value = false;
        } else if (!isUsingCustomMenu) {
            showActions.value = false;
            showColors.value = false;
        }
    });
}

// CRITICAL: Save + clear selection → mutate → restore
function withSavedSelection(fn: () => void) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        fn();
        return;
    }

    const range = sel.getRangeAt(0).cloneRange();
    const wasCollapsed = sel.isCollapsed;

    sel.removeAllRanges(); // ← This is the magic line
    fn();
    if (!wasCollapsed) {
        sel.addRange(range);
    }
}

function applyHighlight(color: string) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!content.value?.contains(range.commonAncestorContainer)) return;

    // Recolor existing full mark?
    const ancestor = range.commonAncestorContainer;
    const markAncestor =
        ancestor instanceof Element
            ? ancestor.closest("mark")
            : ancestor.parentElement?.closest("mark");

    if (
        markAncestor &&
        markAncestor.contains(range.startContainer) &&
        markAncestor.contains(range.endContainer)
    ) {
        withSavedSelection(() => {
            markAncestor.style.backgroundColor = color;
            saveHighlights();
        });
        updateMenu();
        return;
    }

    // Fresh highlight — safe DOM mutation
    withSavedSelection(() => {
        const mark = document.createElement("mark");
        mark.style.backgroundColor = color;

        const contents = range.extractContents();
        mark.appendChild(contents);
        range.insertNode(mark);

        if (mark.parentNode) mark.parentNode.normalize();
        saveHighlights();
    });

    updateMenu();
}

function removeHighlight() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const marks = Array.from(content.value?.querySelectorAll("mark") || []).filter((m) =>
        range.intersectsNode(m),
    );

    withSavedSelection(() => {
        marks.forEach((mark) => {
            const parent = mark.parentNode;
            while (mark.firstChild) parent?.insertBefore(mark.firstChild, mark);
            parent?.removeChild(mark);
        });
        marks[0]?.parentNode?.normalize();
        saveHighlights();
    });

    updateMenu();
}

function copyText() {
    navigator.clipboard.writeText(window.getSelection()?.toString() || "");
    hideMenu();
}

function hideMenu() {
    showActions.value = false;
    showColors.value = false;
    isUsingCustomMenu = false;
}

function saveHighlights() {
    const prose = content.value?.querySelector(".prose");
    if (!prose) return;
    const html = prose.innerHTML;
    const data = JSON.parse(localStorage.getItem("highlights") || "{}");
    if (html.includes("<mark")) data[props.contentId] = html;
    else delete data[props.contentId];
    localStorage.setItem("highlights", JSON.stringify(data));
}

function restoreHighlights() {
    const data = JSON.parse(localStorage.getItem("highlights") || "{}");
    const saved = data[props.contentId];
    if (saved && content.value) {
        content.value.querySelector(".prose")!.innerHTML = saved;
    }
}

function handleContextMenu(e: Event) {
    if (showActions.value) e.preventDefault();
}

function handleClickOutside(e: MouseEvent) {
    if (actionsMenu.value && !actionsMenu.value.contains(e.target as Node)) hideMenu();
}

function startMenuInteraction() {
    isUsingCustomMenu = true;
}

watch(showActions, (v) => {
    if (!v) isUsingCustomMenu = false;
    content.value?.classList.toggle("native-selection-hidden", v);
});

onMounted(() => {
    restoreHighlights();
    document.addEventListener("selectionchange", updateMenu);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleClickOutside);
    setTimeout(updateMenu, 100);
});

onUnmounted(() => {
    document.removeEventListener("selectionchange", updateMenu);
    document.removeEventListener("contextmenu", handleContextMenu);
    document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
    <div ref="content" class="relative">
        <div class="prose select-text" :class="{ 'native-selection-hidden': showActions }">
            <slot />
        </div>

        <teleport to="body">
            <transition
                enter-active-class="transition duration-150 ease-out"
                leave-active-class="transition duration-100 ease-in"
                enter-from-class="scale-90 opacity-0"
                leave-to-class="scale-90 opacity-0"
            >
                <div
                    v-if="showActions"
                    ref="actionsMenu"
                    class="fixed z-[9999] -translate-x-1/2 select-none rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
                    :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }"
                    @mousedown.prevent="startMenuInteraction"
                    @touchstart.prevent="startMenuInteraction"
                    @click.stop
                >
                    <div v-if="showColors" class="flex flex-wrap items-center gap-4">
                        <button @click="removeHighlight" class="rounded-lg p-2 hover:bg-red-50">
                            <MinusCircleIcon class="size-9 text-red-600" />
                        </button>
                        <button
                            v-for="(color, name) in colors"
                            :key="name"
                            class="h-12 w-12 rounded-full border-4 border-white shadow-lg ring-2 ring-gray-200 transition-transform hover:scale-110"
                            :style="{ backgroundColor: color }"
                            @click="applyHighlight(color)"
                        />
                        <button
                            @click="showColors = false"
                            class="ml-4 text-sm font-medium text-gray-600"
                        >
                            Back
                        </button>
                    </div>

                    <div v-else class="flex gap-10">
                        <button @click="showColors = true" class="flex flex-col items-center">
                            <PencilIcon class="size-10 text-blue-600" />
                            <span class="mt-2 text-xs font-semibold">Highlight</span>
                        </button>
                        <button @click="copyText" class="flex flex-col items-center">
                            <DocumentIcon class="size-10 text-green-600" />
                            <span class="mt-2 text-xs font-semibold">Copy</span>
                        </button>
                    </div>
                </div>
            </transition>
        </teleport>
    </div>
</template>

<style scoped>
mark {
    border-radius: 4px;
    padding: 0 4px;
    margin: 0 -4px;
    transition: background-color 0.2s;
}

.native-selection-hidden::selection,
.native-selection-hidden *::selection {
    background: transparent !important;
}

.native-selection-hidden * {
    -webkit-user-select: none !important;
    user-select: none !important;
}

.prose:not(.native-selection-hidden) {
    -webkit-user-select: text !important;
    user-select: text !important;
}
</style>
