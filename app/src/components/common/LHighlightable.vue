<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import {
    DocumentDuplicateIcon,
    PencilSquareIcon,
    TrashIcon,
    ChevronLeftIcon,
    ShareIcon,
} from "@heroicons/vue/24/outline";
import { useI18n } from "vue-i18n";
import { db, reportError } from "luminary-shared";
import {
    getHighlightRanges,
    getLegacyHighlightHtml,
    type SavedHighlight,
} from "@/recommendation/highlightStore";
import {
    HIGHLIGHT_COLORS,
    addHighlight,
    anchorHighlights,
    extendToPunctuation,
    overlaps,
    paintHighlights,
    rangesFromLegacyHtml,
    removeHighlights,
    snapToWords,
    textOffset,
    type HighlightColor,
    type HighlightRange,
} from "@/util/highlightRanges";
import TelegramIcon from "@/components/icons/TelegramIcon.vue";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon.vue";
import XIcon from "@/components/icons/XIcon.vue";
import RedditIcon from "@/components/icons/RedditIcon.vue";
import InstagramIcon from "@/components/icons/InstagramIcon.vue";
import {
    buildTelegramShareUrl,
    buildWhatsAppShareUrl,
    buildXShareUrl,
    buildRedditShareUrl,
    formatShareMessage,
} from "@/composables/useSocialShare";
import { useNotificationStore } from "@/stores/notification";

const props = withDefaults(
    defineProps<{
        contentId: string;
        title: string;
        copyright?: string;
        /** Gates the share targets on the ACL Share permission; defaults open for callers that don't check it. */
        canShare?: boolean;
        /** Changes whenever the slotted article is re-rendered, so its highlights are repainted. */
        revision?: unknown;
    }>(),
    { canShare: true },
);
// Fired when a highlight is created or genuinely removed. The parent (which knows
// the content's tags) decides what to do with these events. `highlightsChanged` is
// emitted only after IndexedDB reflects the active highlights, so other local consumers
// can safely re-read it without coupling this generic component to recommendations.
const emit = defineEmits<{ highlighted: []; highlightRemoved: []; highlightsChanged: [] }>();

const { t } = useI18n();

const content = ref<HTMLElement | undefined>(undefined);
const prose = ref<HTMLElement | undefined>(undefined);
// Source of truth for this article's highlights; the DOM marks are only a rendering of it.
let highlights: HighlightRange[] = [];
const actionsMenu = ref<HTMLElement | undefined>(undefined);
const showActions = ref(false);
const menuPos = ref({ x: 0, y: 0 });
const menuWidth = ref(0);
// Centred on the selection, but never hanging off either side of the screen.
const menuLeft = computed(() => {
    const half = menuWidth.value / 2 + 8;
    return Math.max(half, Math.min(menuPos.value.x, window.innerWidth - half));
});
const isHighlighted = ref(false);
const canHighlight = ref(false);
const showColorPicker = ref(false);
const showShareMenu = ref(false);
const selectedTextForShare = ref("");

let debounceTimeout: ReturnType<typeof setTimeout> | undefined;

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
    showShareMenu.value = false;

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        updateMenuState();
    }, 250); // Wait for selection to settle
}

function updateMenuState() {
    const rect = getSelectionRect();

    if (rect) {
        checkIfHighlighted();
        positionMenu(rect);
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

function positionMenu(rect: DOMRect) {
    // Center menu above the selection
    menuPos.value = {
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
    };
}

function repositionMenu() {
    const rect = getSelectionRect();
    if (rect) positionMenu(rect);
}

let scrollFrame: number | undefined;

// The popup is `fixed`, so it has to be moved along with the text it points at.
function onScroll() {
    if (!showActions.value) return;
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
        scrollFrame = undefined;
        repositionMenu();
    });
}

// The popup's width changes with what it shows (colours, share targets).
const menuResizeObserver =
    typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => (menuWidth.value = actionsMenu.value?.offsetWidth ?? 0))
        : undefined;

watch(actionsMenu, (el, old) => {
    if (old) menuResizeObserver?.unobserve(old);
    if (!el) return;
    menuWidth.value = el.offsetWidth;
    menuResizeObserver?.observe(el);
});

// Reflowing the article (reader settings, rotation) moves the selection out from under the popup.
const contentResizeObserver =
    typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
              if (showActions.value) repositionMenu();
          })
        : undefined;

/** The selection as offsets into the article text, if it lies inside it. */
function selectionBounds(): { start: number; end: number; text: string } | undefined {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !prose.value) return undefined;
    const range = sel.getRangeAt(0);
    if (!prose.value.contains(range.commonAncestorContainer)) return undefined;
    return {
        start: textOffset(prose.value, range.startContainer, range.startOffset),
        end: textOffset(prose.value, range.endContainer, range.endOffset),
        text: prose.value.textContent ?? "",
    };
}

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, dd, dt, figcaption";

/** What a new highlight would cover: whole words, running on to the end of the phrase. */
function selectedWords() {
    const bounds = selectionBounds();
    const snapped = bounds && snapToWords(bounds.text, bounds.start, bounds.end);
    if (!snapped || !prose.value) return snapped;

    // The phrase can't run past the paragraph the selection ends in.
    const range = window.getSelection()!.getRangeAt(0);
    const endEl =
        range.endContainer instanceof Element
            ? range.endContainer
            : range.endContainer.parentElement;
    const block = endEl?.closest(BLOCKS);
    const limit =
        block && prose.value.contains(block)
            ? textOffset(prose.value, block, block.childNodes.length)
            : bounds.text.length;
    return { start: snapped.start, end: extendToPunctuation(bounds.text, snapped.end, limit) };
}

/** Highlights the raw selection touches — unsnapped, so a stray mark on punctuation can still be removed. */
function selectedHighlights(): { start: number; end: number } | undefined {
    const bounds = selectionBounds();
    return bounds && highlights.some((h) => overlaps(h, bounds.start, bounds.end))
        ? bounds
        : undefined;
}

function checkIfHighlighted() {
    isHighlighted.value = !!selectedHighlights();
    canHighlight.value = !!selectedWords();
}

// Highlighting

function applyColor(color: HighlightColor) {
    const offsets = selectedWords();
    if (!offsets || !prose.value) return;
    highlights = addHighlight(
        highlights,
        prose.value.textContent ?? "",
        offsets.start,
        offsets.end,
        color,
    );
    paintHighlights(prose.value, highlights);
    emit("highlighted");
    finalizeHighlight();
}

function removeHighlight() {
    const offsets = selectedHighlights();
    if (offsets && prose.value) {
        const remaining = removeHighlights(highlights, offsets.start, offsets.end);
        if (remaining.length < highlights.length) {
            highlights = remaining;
            paintHighlights(prose.value, highlights);
            emit("highlightRemoved");
        }
    }
    finalizeHighlight();
}

function finalizeHighlight() {
    window.getSelection()?.removeAllRanges();
    // Persist first: the change notification lets recommendation consumers safely
    // re-read the active highlight text without racing the IndexedDB write.
    void saveHighlights().then((saved) => {
        if (saved) emit("highlightsChanged");
    });
    showActions.value = false;
    showColorPicker.value = false;
}

// Copied text carries its attribution and a link back, so a pasted quote can always be
// traced to the article it came from.
function copyText() {
    const sel = window.getSelection();
    if (sel) {
        navigator.clipboard
            .writeText(shareMessage(sel.toString(), { withUrl: true }))
            .catch((e) => console.error("Failed to copy highlight text to clipboard:", e));
        showActions.value = false;
        sel.removeAllRanges();
    }
}

// Sharing

// Captured on open, not read lazily by each platform button — the selection can
// collapse once the user starts interacting with the popup.
function openShareMenu() {
    if (!props.canShare) return;
    const sel = window.getSelection();
    selectedTextForShare.value = sel ? sel.toString() : "";
    showShareMenu.value = true;
}

function closeShareMenu() {
    showShareMenu.value = false;
}

function finalizeShare() {
    showActions.value = false;
    showShareMenu.value = false;
}

function shareMessage(quote: string, options: { withUrl?: boolean } = {}): string {
    return formatShareMessage({
        quote,
        title: props.title,
        copyright: props.copyright,
        url: options.withUrl ? window.location.href : undefined,
    });
}

function shareHighlightText(options: { withUrl?: boolean } = {}): string {
    return shareMessage(selectedTextForShare.value, options);
}

function shareHighlightToTelegram() {
    window.open(
        buildTelegramShareUrl(shareHighlightText(), window.location.href),
        "_blank",
        "noopener,noreferrer",
    );
    finalizeShare();
}

function shareHighlightToWhatsApp() {
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    window.open(
        buildWhatsAppShareUrl(shareHighlightText({ withUrl: true }), isCoarsePointer),
        "_blank",
        "noopener,noreferrer",
    );
    finalizeShare();
}

function shareHighlightToX() {
    window.open(
        buildXShareUrl(shareHighlightText(), window.location.href),
        "_blank",
        "noopener,noreferrer",
    );
    finalizeShare();
}

function shareHighlightToReddit() {
    window.open(
        buildRedditShareUrl(props.title, window.location.href),
        "_blank",
        "noopener,noreferrer",
    );
    finalizeShare();
}

// Instagram has no web share-URL API for posts/links, so the closest one-click
// equivalent is copying the text + link for the user to paste into a DM, Story or bio.
async function shareHighlightToInstagram() {
    try {
        await navigator.clipboard.writeText(shareHighlightText({ withUrl: true }));
    } catch (e) {
        console.error("Failed to copy share text to clipboard:", e);
        finalizeShare();
        return;
    }
    useNotificationStore().addNotification({
        id: "share-link-copied",
        title: t("singlecontent.shareInstagramCopiedTitle"),
        description: t("singlecontent.shareInstagramCopiedDescription"),
        state: "success",
        type: "toast",
        timeout: 5000,
    });
    finalizeShare();
}

// Persistence

/** Persists this content's highlights (with an update time for newest-first recommendation reads). */
async function saveHighlights(): Promise<boolean> {
    try {
        const existingData = (await db.getLuminaryInternals("highlights")) || {};
        const data: Record<string, unknown> =
            typeof existingData === "object" &&
            existingData !== null &&
            !Array.isArray(existingData)
                ? { ...existingData }
                : {};

        if (highlights.length) {
            data[props.contentId] = {
                ranges: highlights,
                updatedAt: Date.now(),
            } satisfies SavedHighlight;
        } else {
            delete data[props.contentId];
        }

        await db.setLuminaryInternals("highlights", data);
        return true;
    } catch (error) {
        reportError(error, { area: "highlights", op: "save" });
        return false;
    }
}

let restoreGeneration = 0;

/** Loads this content's highlights and paints them onto the article as it is now. */
async function restoreHighlights() {
    const generation = ++restoreGeneration;
    highlights = [];
    try {
        const data = (await db.getLuminaryInternals("highlights")) || {};
        const entry =
            typeof data === "object" && data !== null && !Array.isArray(data)
                ? data[props.contentId]
                : undefined;
        const legacyHtml = getLegacyHighlightHtml(entry);
        const saved =
            getHighlightRanges(entry) ?? (legacyHtml ? rangesFromLegacyHtml(legacyHtml) : []);

        if (generation !== restoreGeneration) return; // the article changed mid-load
        if (saved.length && prose.value) {
            highlights = anchorHighlights(saved, prose.value.textContent ?? "");
            paintHighlights(prose.value, highlights);
        }
    } catch (error) {
        reportError(error, { area: "highlights", op: "restore" });
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

// Post-flush: the re-rendered article (and the loss of its marks) has landed by then.
watch(
    () => [props.contentId, props.revision],
    () => void restoreHighlights(),
    { flush: "post" },
);

onMounted(async () => {
    await restoreHighlights();
    document.addEventListener("selectionchange", onSelectionChange);
    // Captured: the article scrolls an inner container, whose scroll events don't bubble to document.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });

    // Add document-level context menu prevention for iOS
    document.addEventListener("contextmenu", documentContextMenuHandler, { capture: true });

    // Add selectstart listener to track when selection begins
    content.value?.addEventListener("selectstart", handleSelectStart);
    if (content.value) contentResizeObserver?.observe(content.value);
});

onUnmounted(() => {
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("scroll", onScroll, { capture: true });
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
    document.removeEventListener("contextmenu", documentContextMenuHandler, { capture: true });
    content.value?.removeEventListener("selectstart", handleSelectStart);
    contentResizeObserver?.disconnect();
    menuResizeObserver?.disconnect();
    clearTimeout(debounceTimeout);

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
        <div
            ref="prose"
            class="prose max-w-none select-text"
        >
            <slot />
        </div>

        <!-- Action Menu -->
        <teleport to="body">
            <div
                v-if="showActions"
                ref="actionsMenu"
                class="fixed z-50 flex -translate-x-1/2 -translate-y-full flex-col items-center rounded-full bg-white p-1 shadow-xl ring-1 ring-zinc-200 dark:bg-slate-700 dark:ring-slate-500"
                :style="{ left: menuLeft + 'px', top: menuPos.y + 'px' }"
                @mousedown.stop.prevent
            >
                <!-- Main Menu -->
                <div
                    v-if="!showColorPicker && !showShareMenu"
                    class="flex flex-col items-center"
                >
                    <div class="flex items-center gap-0.5">
                        <!-- Highlight: also offered over an existing highlight, to recolour or extend it -->
                        <button
                            v-if="canHighlight"
                            @click="showColorPicker = true"
                            data-test="highlightStart"
                            class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500"
                        >
                            <PencilSquareIcon class="size-4" />
                            {{ t("singlecontent.highlight") }}
                        </button>

                        <!-- Remove -->
                        <button
                            v-if="isHighlighted"
                            @click="removeHighlight"
                            data-test="highlightRemove"
                            class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500"
                        >
                            <TrashIcon class="size-4" />
                            {{ t("singlecontent.removeHighlight") }}
                        </button>

                        <!-- Copy -->
                        <button
                            @click="copyText"
                            data-test="highlightCopy"
                            class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500"
                        >
                            <DocumentDuplicateIcon class="size-4" />
                            {{ t("singlecontent.copy") }}
                        </button>

                        <template v-if="canShare">
                            <!-- Share -->
                            <button
                                @click="openShareMenu"
                                data-test="highlightShareTrigger"
                                class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500"
                            >
                                <ShareIcon class="size-4" />
                                {{ t("singlecontent.share") }}
                            </button>
                        </template>
                    </div>
                </div>

                <!-- Color Picker -->
                <div
                    v-else-if="showColorPicker"
                    class="flex items-center gap-2 px-1 py-0.5"
                >
                    <button
                        @click="showColorPicker = false"
                        :aria-label="t('singlecontent.back')"
                        class="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                        <ChevronLeftIcon class="size-5" />
                    </button>

                    <div class="flex gap-2">
                        <button
                            v-for="(color, name) in HIGHLIGHT_COLORS"
                            :key="name"
                            class="size-6 rounded-full ring-1 ring-zinc-200 transition-transform hover:scale-110 dark:ring-slate-400"
                            :style="{ backgroundColor: color }"
                            :aria-label="t(`singlecontent.highlightColor.${name}`)"
                            @click="applyColor(name)"
                        ></button>
                    </div>
                </div>

                <!-- Share Targets -->
                <div
                    v-else
                    class="flex items-center gap-1 px-1 py-0.5"
                >
                    <button
                        @click="closeShareMenu"
                        :aria-label="t('singlecontent.back')"
                        data-test="highlightShareBack"
                        class="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                        <ChevronLeftIcon class="size-5" />
                    </button>

                    <div class="flex gap-1">
                        <button
                            @click="shareHighlightToTelegram"
                            data-test="highlightShareTelegram"
                            :aria-label="t('singlecontent.shareTelegram')"
                            class="rounded-full p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600"
                        >
                            <TelegramIcon class="size-5" />
                        </button>
                        <button
                            @click="shareHighlightToWhatsApp"
                            data-test="highlightShareWhatsApp"
                            :aria-label="t('singlecontent.shareWhatsApp')"
                            class="rounded-full p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600"
                        >
                            <WhatsAppIcon class="size-5" />
                        </button>
                        <button
                            @click="shareHighlightToX"
                            data-test="highlightShareX"
                            :aria-label="t('singlecontent.shareX')"
                            class="rounded-full p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600"
                        >
                            <XIcon class="size-5" />
                        </button>
                        <button
                            @click="shareHighlightToReddit"
                            data-test="highlightShareReddit"
                            :aria-label="t('singlecontent.shareReddit')"
                            class="rounded-full p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600"
                        >
                            <RedditIcon class="size-5" />
                        </button>
                        <button
                            @click="shareHighlightToInstagram"
                            data-test="highlightShareInstagram"
                            :aria-label="t('singlecontent.shareInstagram')"
                            class="rounded-full p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600"
                        >
                            <InstagramIcon class="size-5" />
                        </button>
                    </div>
                </div>
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
