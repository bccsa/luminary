<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { DocumentIcon, MinusCircleIcon, PencilIcon } from "@heroicons/vue/24/outline";

const props = defineProps<{ contentId: string }>();

const content = ref<HTMLElement | null>(null);
const actionsMenu = ref<HTMLElement | null>(null);

const showActions = ref(false);
const showColors = ref(false);
const menuPos = ref({ x: 0, y: 0 });

const colors = {
    yellow: "rgba(255,255,0,0.3)",
    green: "rgba(0,255,0,0.3)",
    blue: "rgba(0,255,255,0.3)",
    pink: "rgba(255,192,203,0.3)",
    orange: "rgba(255,165,0,0.3)",
    purple: "rgba(128,0,128,0.3)",
};

let debounceTimer: number | null = null;

function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return range.getBoundingClientRect();
}

function updateMenu() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        const rect = getSelectionRect();
        const sel = window.getSelection();

        const isValidSelection =
            sel &&
            !sel.isCollapsed &&
            rect &&
            rect.width > 0 &&
            rect.height > 0 &&
            content.value?.contains(sel.anchorNode);

        if (isValidSelection && rect) {
            menuPos.value = {
                x: rect.left + rect.width / 2,
                y: rect.top - 8, // Slightly above
            };
            showActions.value = true;
            showColors.value = false;
        } else {
            showActions.value = false;
            showColors.value = false;
        }
    }, 120);
}

function applyHighlight(color: string) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!content.value?.contains(range.commonAncestorContainer)) return;

    // If already fully inside a mark → recolor
    const ancestorMark =
        range.commonAncestorContainer instanceof Element
            ? range.commonAncestorContainer.closest("mark")
            : range.commonAncestorContainer.parentElement?.closest("mark");

    if (
        ancestorMark &&
        ancestorMark.contains(range.startContainer) &&
        ancestorMark.contains(range.endContainer)
    ) {
        ancestorMark.style.backgroundColor = color;
    } else {
        const mark = document.createElement("mark");
        mark.style.backgroundColor = color;
        try {
            range.surroundContents(mark);
        } catch {
            const fragment = range.extractContents();
            mark.appendChild(fragment);
            range.insertNode(mark);
        }
    }

    sel.removeAllRanges();
    saveHighlights();
    updateMenu(); // Keep menu open if selection still exists (e.g. partial remove)
}

function removeHighlight() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);

    const marks = Array.from(content.value?.querySelectorAll("mark") || []).filter((mark) =>
        range.intersectsNode(mark),
    );

    marks.forEach((mark) => {
        const parent = mark.parentNode;
        while (mark.firstChild) parent?.insertBefore(mark.firstChild, mark);
        parent?.removeChild(mark);
        if (parent && typeof (parent as Node).normalize === "function") {
            (parent as Node).normalize();
        }
    });

    sel.removeAllRanges();
    saveHighlights();
    updateMenu();
}

function copyText() {
    navigator.clipboard.writeText(window.getSelection()?.toString() || "");
    hideMenu();
}

function hideMenu() {
    showActions.value = false;
    showColors.value = false;
}

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

// One unified handler — no duplicates, no flicker
function handleUserSelection() {
    updateMenu();
}

// Prevent native context menu only when our menu is visible
function handleContextMenu(e: Event) {
    if (showActions.value) e.preventDefault();
}

onMounted(() => {
    restoreHighlights();

    // Only one listener needed!
    document.addEventListener("selectionchange", handleUserSelection);
    document.addEventListener("pointerup", handleUserSelection);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", (e) => {
        if (actionsMenu.value && !actionsMenu.value.contains(e.target as Node)) {
            hideMenu();
        }
    });

    // Initial check
    setTimeout(handleUserSelection, 200);
});

onUnmounted(() => {
    document.removeEventListener("selectionchange", handleUserSelection);
    document.removeEventListener("pointerup", handleUserSelection);
    document.removeEventListener("contextmenu", handleContextMenu);
});
</script>

<template>
    <div ref="content" class="relative">
        <div class="prose select-text" style="user-select: text; -webkit-user-select: text">
            <slot />
        </div>

        <teleport to="body">
            <transition
                enter-active-class="transition duration-100 ease-out"
                leave-active-class="transition duration-75 ease-in"
                enter-from-class="scale-95 opacity-0"
                leave-to-class="scale-95 opacity-0"
            >
                <div
                    v-if="showActions"
                    ref="actionsMenu"
                    class="fixed z-[9999] -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-xl"
                    :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }"
                    @click.stop
                >
                    <div v-if="showColors" class="flex flex-wrap items-center gap-3">
                        <button @click="removeHighlight" class="rounded-lg p-2 hover:bg-red-50">
                            <MinusCircleIcon class="size-8 text-red-600" />
                        </button>
                        <button
                            v-for="(color, name) in colors"
                            :key="name"
                            class="h-10 w-10 rounded-full border-4 border-white shadow-lg transition-transform hover:scale-110"
                            :style="{ backgroundColor: color }"
                            @click="applyHighlight(color)"
                        />
                        <button
                            @click="showColors = false"
                            class="ml-2 text-sm text-gray-600 underline"
                        >
                            Back
                        </button>
                    </div>

                    <div v-else class="flex gap-6">
                        <button @click="showColors = true" class="flex flex-col items-center">
                            <PencilIcon class="size-8 text-blue-600" />
                            <span class="mt-1 text-xs font-medium">Highlight</span>
                        </button>
                        <button @click="copyText" class="flex flex-col items-center">
                            <DocumentIcon class="size-8 text-green-600" />
                            <span class="mt-1 text-xs font-medium">Copy</span>
                        </button>
                    </div>
                </div>
            </transition>
        </teleport>
    </div>
</template>
