<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@heroicons/vue/24/outline";
import { useI18n } from "vue-i18n";
import { TEXT_SIZES, useReaderSettings } from "@/composables/useReaderSettings";

const { t } = useI18n();
const { textSize } = useReaderSettings();

const stepButtonClass =
    "rounded-full p-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-100 dark:hover:bg-slate-600";
</script>

<template>
    <div class="flex items-center gap-2">
        <button
            type="button"
            :class="stepButtonClass"
            :disabled="textSize === 0"
            :aria-label="t('singlecontent.smallerText')"
            data-test="textSizeDecrease"
            @click="textSize--"
        >
            <MinusIcon class="size-4" />
        </button>
        <!-- Explicit thumb/track resets: appearance-none + accent colour alone renders a doubled bar in some engines.
             mousedown is stopped so a parent popup's preventDefault (used to keep the text selection) can't block dragging. -->
        <input
            type="range"
            min="0"
            :max="TEXT_SIZES.length - 1"
            step="1"
            :value="textSize"
            :aria-label="t('singlecontent.textSize')"
            class="h-5 min-w-32 flex-1 cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-yellow-500 [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-200 dark:[&::-moz-range-track]:bg-slate-500 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-200 dark:[&::-webkit-slider-runnable-track]:bg-slate-500 [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500"
            data-test="textSizeSlider"
            @input="textSize = Number(($event.target as HTMLInputElement).value)"
            @mousedown.stop
        />
        <button
            type="button"
            :class="stepButtonClass"
            :disabled="textSize === TEXT_SIZES.length - 1"
            :aria-label="t('singlecontent.largerText')"
            data-test="textSizeIncrease"
            @click="textSize++"
        >
            <PlusIcon class="size-4" />
        </button>
    </div>
</template>
