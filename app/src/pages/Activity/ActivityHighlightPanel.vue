<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { type ContentDto, type HighlightColor, type HighlightRange } from "luminary-shared";
import { XMarkIcon } from "@heroicons/vue/24/outline";
import { TrashIcon } from "@heroicons/vue/24/solid";
import LSidePanel from "@/components/common/LSidePanel.vue";
import LButton from "@/components/button/LButton.vue";
import LDialog from "@/components/common/LDialog.vue";
import { HIGHLIGHT_COLORS } from "@/util/highlightRanges";

const { t } = useI18n();
const router = useRouter();

const props = defineProps<{ content?: ContentDto; ranges: HighlightRange[] }>();

const open = defineModel<boolean>("open", { required: true });

/** Removal is the caller's: only it knows which activity row the passages came from. */
const emit = defineEmits<{ remove: []; removeRange: [range: HighlightRange] }>();

const colour = ref<HighlightColor | undefined>(undefined);

// Each opening starts unfiltered — a colour kept from the entry before would hide passages
// without the reader having asked for it, and may not even exist in this one.
watch(
    () => props.content?._id,
    () => (colour.value = undefined),
);

/** Only the colours actually used, in the palette's order, so the filter has no dead chips. */
const colours = computed(() =>
    (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).filter((c) =>
        props.ranges.some((range) => range.color === c),
    ),
);

const shown = computed(() =>
    colour.value ? props.ranges.filter((r) => r.color === colour.value) : props.ranges,
);

const chipClass = (active: boolean) =>
    active
        ? "bg-zinc-700 text-white dark:bg-slate-100 dark:text-slate-900"
        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300";

const MAX_TEXT_IN_URL = 120;

const openArticle = async (range?: HighlightRange) => {
    const slug = props.content?.slug;
    if (!slug) return;

    if (!range) {
        router.push({ name: "content", params: { slug } });
        return;
    }

    await router.push({
        name: "content",
        params: { slug },
        query: {
            highlightStart: String(range.start),
            highlightText: range.text.slice(0, MAX_TEXT_IN_URL),
            highlightColor: range.color,
        },
    });

    scrollToPassage(range);
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const findPassage = (text: string): globalThis.Range | undefined => {
    const snippet = squash(text).slice(0, 60).toLowerCase();
    if (!snippet) return undefined;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
            node.parentElement?.closest('[data-test="highlight-text"], script, style, noscript')
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
    });

    let flat = "";
    const map: { node: Text; offset: number }[] = [];
    let prevSpace = false;

    for (
        let node = walker.nextNode() as Text | null;
        node;
        node = walker.nextNode() as Text | null
    ) {
        const value = node.nodeValue ?? "";
        for (let i = 0; i < value.length; i++) {
            let ch = value[i];
            if (/\s/.test(ch)) {
                if (prevSpace) continue;
                ch = " ";
                prevSpace = true;
            } else {
                prevSpace = false;
            }
            flat += ch.toLowerCase();
            map.push({ node, offset: i });
        }
    }

    const at = flat.indexOf(snippet);
    if (at === -1) return undefined;

    const first = map[at];
    const last = map[at + snippet.length - 1];
    const found = document.createRange();
    found.setStart(first.node, first.offset);
    found.setEnd(last.node, last.offset + 1);
    return found;
};

const scrollToPassage = (range: HighlightRange, attempt = 0) => {
    const found = findPassage(range.text);

    if (found) {
        const el = found.startContainer.parentElement;
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        const previous = { outline: el.style.outline, transition: el.style.transition };
        el.style.transition = "outline-color 0.4s ease";
        el.style.outline = `3px solid ${HIGHLIGHT_COLORS[range.color]}`;
        el.style.outlineOffset = "2px";
        setTimeout(() => {
            el.style.outline = previous.outline;
            el.style.transition = previous.transition;
            el.style.outlineOffset = "";
        }, 2500);
        return;
    }

    if (attempt < 40) setTimeout(() => scrollToPassage(range, attempt + 1), 200);
};

const confirming = ref(false);

const remove = () => {
    confirming.value = false;
    emit("remove");
    open.value = false;
};
</script>

<template>
    <LSidePanel
        v-model:open="open"
        width-class="w-[26rem]"
    >
        <template #header="{ close }">
            <div
                class="flex items-start gap-2 border-b border-zinc-200 px-4 py-3 dark:border-slate-600"
            >
                <h2
                    class="min-w-0 flex-1 text-base font-semibold text-zinc-800 dark:text-slate-50"
                    data-test="highlight-panel-title"
                >
                    {{ content?.title }}
                </h2>
                <button
                    type="button"
                    class="-mr-1 rounded-full p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    :aria-label="t('activity.highlights.close')"
                    data-test="highlight-panel-close"
                    @click="close()"
                >
                    <XMarkIcon class="h-5 w-5" />
                </button>
            </div>
        </template>

        <div class="space-y-4 px-4 py-4">
            <!-- A single colour needs no filter: the chips would only state what is shown. -->
            <div
                v-if="colours.length > 1"
                class="flex flex-wrap gap-2"
            >
                <button
                    type="button"
                    class="rounded-full px-3 py-1 text-sm transition-colors"
                    :class="chipClass(colour === undefined)"
                    data-test="highlight-colour-all"
                    @click="colour = undefined"
                >
                    {{ t("activity.highlights.all_colours") }}
                </button>
                <button
                    v-for="c in colours"
                    :key="c"
                    type="button"
                    class="flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors"
                    :class="chipClass(colour === c)"
                    :data-test="`highlight-colour-${c}`"
                    @click="colour = c"
                >
                    <span
                        class="h-3 w-3 rounded-full"
                        :style="{ backgroundColor: HIGHLIGHT_COLORS[c] }"
                    />
                    {{ t(`singlecontent.highlightColor.${c}`) }}
                </button>
            </div>

            <ul class="space-y-3">
                <li
                    v-for="(range, index) in shown"
                    :key="`${range.start}-${index}`"
                    role="link"
                    tabindex="0"
                    class="flex cursor-pointer items-start gap-2 rounded-md border border-l-4 border-zinc-200 bg-white py-2 pl-3 pr-3 text-sm text-zinc-700 shadow-sm transition duration-200 ease-out hover:scale-[1.03] hover:shadow-md focus-visible:scale-[1.03] focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus-visible:ring-slate-400"
                    :style="{ borderLeftColor: HIGHLIGHT_COLORS[range.color] }"
                    data-test="highlight-text"
                    @click="openArticle(range)"
                    @keydown.enter.prevent="openArticle(range)"
                    @keydown.space.prevent="openArticle(range)"
                >
                    <span class="min-w-0 flex-1">{{ range.text }}</span>

                    <button
                        type="button"
                        class="-my-1 shrink-0 rounded-full p-1.5 text-zinc-500 transition hover:text-red-600 focus:text-red-600 active:text-red-700 dark:text-slate-400 dark:hover:text-red-400 dark:focus:text-red-400 dark:active:text-red-500"
                        :aria-label="t('activity.highlights.remove_passage')"
                        data-test="highlight-passage-remove"
                        @click.stop.prevent="emit('removeRange', range)"
                        @keydown.enter.stop
                        @keydown.space.stop
                    >
                        <TrashIcon class="h-4 w-4" />
                    </button>
                </li>
            </ul>
        </div>

        <template #footer>
            <div
                class="flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 dark:border-slate-600"
            >
                <LButton
                    variant="primary"
                    data-test="highlight-panel-open-article"
                    @click="openArticle()"
                >
                    {{ t("activity.highlights.open_article") }}
                </LButton>
                <LButton
                    variant="danger"
                    data-test="highlight-panel-remove"
                    @click="confirming = true"
                >
                    {{ t("activity.remove.button") }}
                </LButton>
            </div>
        </template>
    </LSidePanel>

    <LDialog
        v-if="confirming"
        :open="true"
        :title="t('activity.remove.confirm.title')"
        :description="t('activity.remove.confirm.description')"
        :primaryAction="remove"
        :primaryButtonText="t('activity.remove.button')"
        :secondaryAction="() => (confirming = false)"
        :secondaryButtonText="t('activity.remove.confirm.button_cancel')"
        context="danger"
        @update:open="confirming = false"
    />
</template>
