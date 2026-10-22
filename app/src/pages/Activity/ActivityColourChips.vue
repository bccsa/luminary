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

const chipClass = (active: boolean) =>
    active
        ? "bg-zinc-700 text-white dark:bg-slate-100 dark:text-slate-900"
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
        <button
            v-for="c in colours"
            :key="c"
            type="button"
            class="flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors"
            :class="chipClass(active === c)"
            :data-test="`highlight-colour-${c}`"
            @click="$emit('select', c)"
        >
            <span
                class="h-3 w-3 rounded-full"
                :style="{ backgroundColor: HIGHLIGHT_COLORS[c] }"
            />
            {{ t(`singlecontent.highlightColor.${c}`) }}
        </button>
    </div>
</template>
