<script setup lang="ts">
import { computed } from "vue";
import type { ContentDto } from "luminary-shared";
import { cmsLanguages } from "@/globalConfig";
import { isFallbackLanguageContent } from "@/util/isFallbackLanguageContent";

/**
 * A small chip shown when `content` is displayed in a language the user did not choose (a fallback).
 * Renders nothing for normal (chosen-language) content, or until the language doc has loaded.
 */
const props = defineProps<{ content?: Pick<ContentDto, "language"> | null }>();

const isFallback = computed(() => isFallbackLanguageContent(props.content));
const language = computed(() =>
    props.content?.language
        ? cmsLanguages.value.find((l) => l._id === props.content!.language)
        : undefined,
);
</script>

<template>
    <span
        v-if="isFallback && language"
        data-test="fallback-language-badge"
        :title="language.name"
        class="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase leading-none text-zinc-600 dark:bg-slate-700 dark:text-slate-300"
    >
        {{ language.languageCode || language.name }}
    </span>
</template>
