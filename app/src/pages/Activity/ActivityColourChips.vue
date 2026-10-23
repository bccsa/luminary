<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import type { HighlightColor } from "luminary-shared";
import { HIGHLIGHT_COLORS } from "@/util/highlightRanges";

defineProps<{
    colours: readonly HighlightColor[];
    active?: HighlightColor;
}>();

defineEmits<{ select: [colour: HighlightColor | undefined] }>();

const { t } = useI18n();

// The ring is thicker than the section chips': the colour chips carry no text to tell them apart.
const chipClass = (selected: boolean) =>
    selected
        ? "bg-zinc-100 text-yellow-700 ring-2 ring-yellow-700/50 dark:bg-slate-700 dark:text-yellow-400 dark:ring-yellow-400/50"
        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600";
</script>

<template>
    <div class="flex flex-wrap gap-2">
        <button
            type="button"
            class="rounded-full px-3 py-1 text-sm transition-colors"
            :class="chipClass(active === undefined)"
            data-test="highlight-colour-all"
            @click="$emit('select', undefined)"
        >
            {{ t("activity.highlights.all_colours") }}
        </button>
        <!-- The colour is the whole label, so the name lives on the accessible side only. -->
        <button
            v-for="c in colours"
            :key="c"
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            :class="chipClass(active === c)"
            :aria-label="t(`singlecontent.highlightColor.${c}`)"
            :aria-pressed="active === c"
            :title="t(`singlecontent.highlightColor.${c}`)"
            :data-test="`highlight-colour-${c}`"
            @click="$emit('select', c)"
        >
            <span
                class="h-3 w-3 rounded-full"
                :style="{ backgroundColor: HIGHLIGHT_COLORS[c] }"
            />
        </button>
    </div>
</template>
