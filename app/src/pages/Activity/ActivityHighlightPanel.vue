<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { type ContentDto, type HighlightColor, type HighlightRange } from "luminary-shared";
import { XMarkIcon } from "@heroicons/vue/24/outline";
import MobileSidebar from "@/components/common/MobileSidebar.vue";
import LButton from "@/components/button/LButton.vue";
import LDialog from "@/components/common/LDialog.vue";
import { HIGHLIGHT_COLORS } from "@/util/highlightRanges";

const { t } = useI18n();
const router = useRouter();

const props = defineProps<{ content?: ContentDto; ranges: HighlightRange[] }>();

const open = defineModel<boolean>("open", { required: true });

/** Removal is the caller's: only it knows which activity row the passages came from. */
const emit = defineEmits<{ remove: [] }>();

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

const openArticle = () => {
    const slug = props.content?.slug;
    if (slug) router.push({ name: "content", params: { slug } });
};

// The panel stays open behind the confirmation, which sits above it, so cancelling lands the
// reader back on the passages with nothing to restore.
const confirming = ref(false);

// Told before the panel closes: closing clears the caller's entry, and it needs that entry
// to know which row to delete.
const remove = () => {
    confirming.value = false;
    emit("remove");
    open.value = false;
};
</script>

<template>
    <MobileSidebar
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

            <ul class="space-y-2">
                <li
                    v-for="(range, index) in shown"
                    :key="`${range.start}-${index}`"
                    class="border-l-4 pl-3 text-sm text-zinc-700 dark:text-slate-200"
                    :style="{ borderColor: HIGHLIGHT_COLORS[range.color] }"
                    data-test="highlight-text"
                >
                    {{ range.text }}
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
    </MobileSidebar>

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
