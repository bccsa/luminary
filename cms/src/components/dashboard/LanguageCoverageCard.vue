<script setup lang="ts">
import { computed } from "vue";
import { type ContentDto } from "luminary-shared";
import { cmsLanguages, cmsLanguageIdAsRef } from "@/globalConfig";
import LCard from "@/components/common/LCard.vue";
import { GlobeEuropeAfricaIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
    title: string;
    allContentDocs: ContentDto[];
}>();

const contentCountPerLanguage = computed(() => {
    const counts: Record<string, number> = {};
    for (const doc of props.allContentDocs) {
        counts[doc.language] = (counts[doc.language] ?? 0) + 1;
    }
    return counts;
});

const maxContentCount = computed(() => {
    const values = Object.values(contentCountPerLanguage.value);
    return values.length ? Math.max(...values) : 0;
});
</script>

<template>
    <LCard :title="title" :icon="GlobeEuropeAfricaIcon" class="-mx-1 lg:mx-0">
        <div v-if="cmsLanguages.length === 0" class="py-4 text-center text-sm text-zinc-400">
            No languages configured.
        </div>
        <ul v-else class="space-y-1.5">
            <li v-for="lang in cmsLanguages" :key="lang._id">
                <div class="flex items-center justify-between text-sm">
                    <span
                        class="font-medium"
                        :class="
                            lang._id === cmsLanguageIdAsRef ? 'text-yellow-600' : 'text-zinc-700'
                        "
                    >
                        {{ lang.name }}
                        <span class="text-xs text-zinc-400"> ({{ lang.languageCode }}) </span>
                    </span>
                    <span class="text-xs tabular-nums text-zinc-500">
                        {{ contentCountPerLanguage[lang._id] ?? 0 }}
                    </span>
                </div>
                <div class="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                        class="h-full rounded-full transition-all"
                        :class="lang._id === cmsLanguageIdAsRef ? 'bg-yellow-500' : 'bg-zinc-300'"
                        :style="{
                            width:
                                maxContentCount > 0
                                    ? `${((contentCountPerLanguage[lang._id] ?? 0) / maxContentCount) * 100}%`
                                    : '0%',
                        }"
                    />
                </div>
            </li>
        </ul>
    </LCard>
</template>
