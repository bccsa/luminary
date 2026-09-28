<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import TextSizeSlider from "@/components/content/TextSizeSlider.vue";
import LSelect from "@/components/form/LSelect.vue";
import {
    LINE_HEIGHTS,
    READER_FONTS,
    useReaderSettings,
    type ReaderFontId,
} from "@/composables/useReaderSettings";

const { t } = useI18n();
const { lineHeight, font, articleStyle } = useReaderSettings();

const fontOptions = READER_FONTS.map((f) => ({
    label: f.name,
    value: f.id,
    style: { fontFamily: f.family },
}));
const fontModel = computed({
    get: () => font.value,
    set: (v) => (font.value = v as ReaderFontId),
});

const rowClass = "flex min-h-12 items-center justify-between gap-3 px-3";
// One fixed width for every control, so their left and right edges line up down the list.
const controlClass = "w-52 shrink-0";
const groupClass =
    "grid grid-cols-3 rounded-md bg-zinc-100 p-0.5 text-zinc-600 dark:bg-slate-800/60 dark:text-slate-300";
const segmentClass =
    "flex h-7 cursor-pointer items-center justify-center rounded px-2 transition-colors hover:text-zinc-900 disabled:cursor-default disabled:opacity-30 dark:hover:text-white";
const segmentActiveClass =
    "bg-white text-yellow-600 shadow-sm dark:bg-slate-600 dark:text-yellow-400";
</script>

<template>
    <div class="divide-y divide-zinc-200 dark:divide-slate-600">
        <!-- Same classes and variables as the article body, so the preview is exactly what articles get.
             One paragraph with a line break, so the gap between the lines is the chosen line height. -->
        <p
            :style="articleStyle"
            class="reader-font reader-text prose prose-zinc max-w-full px-3 pb-3 dark:prose-invert lg:prose-lg"
            data-test="readerPreview"
        >
            {{ t("select_theme.preview_line_1") }}<br />{{ t("select_theme.preview_line_2") }}
        </p>

        <div :class="rowClass">
            <span class="text-sm">{{ t("singlecontent.textSize") }}</span>
            <TextSizeSlider :class="controlClass" />
        </div>

        <div :class="rowClass">
            <span class="text-sm">{{ t("singlecontent.lineHeight") }}</span>
            <div :class="[groupClass, controlClass]">
                <button
                    v-for="(height, i) in LINE_HEIGHTS"
                    :key="height"
                    type="button"
                    :class="[segmentClass, { [segmentActiveClass]: lineHeight === i }]"
                    :aria-pressed="lineHeight === i"
                    :aria-label="`${t('singlecontent.lineHeight')} ${height}`"
                    data-test="lineHeightOption"
                    @click="lineHeight = i"
                >
                    <!-- Three strokes whose spacing grows with the line height they stand for. -->
                    <svg
                        class="size-4"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        aria-hidden="true"
                    >
                        <path
                            v-for="line in 3"
                            :key="line"
                            :d="`M4 ${10 + (line - 2) * (3 + i * 2)}h12`"
                        />
                    </svg>
                </button>
            </div>
        </div>

        <div :class="rowClass">
            <span class="text-sm">{{ t("select_theme.font") }}</span>
            <!-- Opens upwards: it's the modal's last row, and a downward list would be clipped by the modal's scroll. -->
            <LSelect
                v-model="fontModel"
                :options="fontOptions"
                size="sm"
                placement="top-end"
                :class="controlClass"
                data-test="fontSelect"
            />
        </div>
    </div>
</template>
