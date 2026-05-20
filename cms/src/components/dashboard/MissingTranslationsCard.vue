<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import { RouterLink } from "vue-router";
import { DocType, PostType, TagType, type ContentDto } from "luminary-shared";
import { cmsLanguages, cmsLanguageIdAsRef } from "@/globalConfig";
import LCard from "@/components/common/LCard.vue";
import LButton from "@/components/button/LButton.vue";
import { PencilSquareIcon } from "@heroicons/vue/20/solid";
import { parentRoute } from "@/util/parentRoute";
import { useListCapacity } from "@/composables/useListCapacity";

const props = defineProps<{
    allContentDocs: ContentDto[];
}>();

const { listEl, capacity, update } = useListCapacity();

const allParentTranslations = computed(() => {
    if (cmsLanguages.value.length === 0) return [];

    const parentLanguageMap = new Map<string, Set<string>>();
    const parentTitleMap = new Map<string, string>();
    const parentTypeMap = new Map<
        string,
        { parentType?: DocType; parentPostType?: PostType; parentTagType?: TagType }
    >();

    for (const doc of props.allContentDocs) {
        if (!parentLanguageMap.has(doc.parentId)) {
            parentLanguageMap.set(doc.parentId, new Set());
        }
        parentLanguageMap.get(doc.parentId)!.add(doc.language);

        if (doc.language === cmsLanguageIdAsRef.value || !parentTitleMap.has(doc.parentId)) {
            parentTitleMap.set(doc.parentId, doc.title);
            parentTypeMap.set(doc.parentId, {
                parentType: doc.parentType,
                parentPostType: doc.parentPostType,
                parentTagType: doc.parentTagType,
            });
        }
    }

    const total = cmsLanguages.value.length;
    return Array.from(parentLanguageMap, ([parentId, langs]) => ({
        parentId,
        title: parentTitleMap.get(parentId) ?? "Untitled",
        translatedLanguages: langs,
        translated: langs.size,
        total,
        ...parentTypeMap.get(parentId),
    }));
});

const missingTranslations = computed(() => {
    if (cmsLanguages.value.length <= 1) return [];
    return allParentTranslations.value
        .filter((p) => p.translated < p.total)
        .sort((a, b) => a.translated - b.translated)
        .slice(0, Math.min(capacity.value, 30));
});

watch(missingTranslations, () => nextTick(update));
</script>

<template>
    <LCard v-if="missingTranslations.length > 0" fillHeight>
        <div class="flex flex-col gap-2 lg:h-full">
            <div class="flex items-center justify-center gap-2">
                <PencilSquareIcon class="h-4 w-4 text-zinc-600" />
                <h3 class="text-sm font-semibold leading-6 text-zinc-900">Needs translation</h3>
            </div>
            <div class="flex w-full justify-center">
                <div class="inline-flex w-full">
                    <LButton
                        :is="RouterLink"
                        :to="{
                            name: 'overview',
                            params: { docType: DocType.Post, tagOrPostType: PostType.Blog },
                        }"
                        variant="secondary"
                        size="sm"
                        class="w-full rounded-r-none"
                    >
                        Blogs
                    </LButton>
                    <LButton
                        :is="RouterLink"
                        :to="{
                            name: 'overview',
                            params: { docType: DocType.Post, tagOrPostType: PostType.Page },
                        }"
                        variant="secondary"
                        size="sm"
                        class="-ml-px w-full rounded-l-none"
                    >
                        Pages
                    </LButton>
                </div>
            </div>
            <div class="lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                <ul ref="listEl" class="divide-y divide-zinc-100">
                    <li
                        v-for="item in missingTranslations"
                        :key="item.parentId"
                        class="rounded-lg p-1.5 hover:bg-zinc-100"
                    >
                        <RouterLink
                            :to="parentRoute(item)!"
                            class="min-w-0 truncate text-sm text-zinc-900 hover:text-yellow-600"
                        >
                            <div class="flex items-center justify-between gap-2">
                                <span v-if="parentRoute(item)">
                                    {{ item.title }}
                                </span>
                                <span v-else class="min-w-0 truncate text-sm text-zinc-900">
                                    {{ item.title }}
                                </span>
                                <span
                                    class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                                >
                                    {{ item.translated }}/{{ item.total }}
                                </span>
                            </div>
                        </RouterLink>
                    </li>
                </ul>
            </div>
        </div>
    </LCard>
</template>
