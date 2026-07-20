<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { decay, DocType, queryLocal, TagType, type BaseDocumentDto, type Uuid } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { affinityProfile } from "@/recommendation/affinityStore";
import { filterTopicTagIds } from "@/recommendation/topicTags";

const isExpanded = ref(false);
const now = ref(Date.now());

onMounted(() => {
    const interval = setInterval(() => {
        now.value = Date.now();
    }, 1000);

    onUnmounted(() => {
        clearInterval(interval);
    });
});

const decayedEntries = computed(() => {
    const decayed = decay(affinityProfile.value, now.value);
    return Object.entries(decayed.affinity).sort((a, b) => b[1] - a[1]);
});

const tagIds = computed(() => decayedEntries.value.map(([tagId]) => tagId));

const tagContent = useContentQuery(
    () =>
        tagIds.value.length
            ? [{ parentId: { $in: tagIds.value } }, { parentType: DocType.Tag }]
            : [{ parentId: { $in: [] } }],
    { includeScheduled: false },
);

const tagTitleMap = computed(() => {
    const map = new Map<string, string>();
    for (const doc of tagContent.value) {
        if (doc.parentId && doc.title) {
            map.set(doc.parentId, doc.title);
        }
    }
    return map;
});

function getPreviewTier(rank: number): string {
    if (rank >= 1 && rank <= 3) return "Core";
    if (rank >= 4 && rank <= 5) return "Strong";
    if (rank >= 6 && rank <= 10) return "Established";
    return "—";
}

const route = useRoute();
const currentSlug = computed(() => {
    const slug = route.params.slug;
    return typeof slug === "string" ? slug : Array.isArray(slug) ? slug[0] : undefined;
});

const currentContentArr = useContentQuery(
    () =>
        currentSlug.value
            ? [{ slug: currentSlug.value }]
            : [{ parentId: { $in: [] } }],
    { includeScheduled: false, languageFilter: false, cache: false },
);

const currentContent = computed(() => currentContentArr.value[0]);

const currentParentTags = computed(() => currentContent.value?.parentTags || []);

const currentPageTags = useContentQuery(
    () =>
        currentParentTags.value.length
            ? [{ parentId: { $in: currentParentTags.value } }, { parentType: DocType.Tag }]
            : [{ parentId: { $in: [] } }],
    { includeScheduled: false },
);

const realTopicFilterResult = ref<Uuid[]>([]);
const unresolvedDocsMap = ref<Map<Uuid, BaseDocumentDto[]>>(new Map());

const unresolvedTagIds = computed(() =>
    currentParentTags.value.filter(
        (id) => !currentPageTags.value.some((t) => t.parentId === id),
    ),
);

watch(
    [currentParentTags, currentPageTags],
    async ([tagIds]) => {
        const result = await filterTopicTagIds(tagIds);
        realTopicFilterResult.value = result;
        console.log("[AffinityDebug] filterTopicTagIds input:", tagIds, "output:", result);

        const newMap = new Map<Uuid, BaseDocumentDto[]>();
        for (const id of unresolvedTagIds.value) {
            const docs = await queryLocal<BaseDocumentDto>({
                selector: { $or: [{ _id: id }, { parentId: id }] },
            });
            newMap.set(id, docs);
        }
        unresolvedDocsMap.value = newMap;
    },
    { immediate: true },
);

const isMismatch = computed(() => {
    const greenRowsCount = currentPageTags.value.filter(
        (t) => t.parentTagType === TagType.Topic,
    ).length;
    return realTopicFilterResult.value.length !== greenRowsCount;
});

function formatDocDetails(doc: BaseDocumentDto): string {
    const parts: string[] = [];
    parts.push(`type: ${doc.type}`);

    if (doc.memberOf !== undefined) {
        parts.push(`memberOf: ${doc.memberOf.length ? doc.memberOf.join(", ") : "none"}`);
    }

    const docRecord = doc as Record<string, unknown>;
    if (docRecord.status !== undefined) {
        parts.push(`status: ${docRecord.status}`);
    }
    if (docRecord.publishDate !== undefined) {
        parts.push(`publishDate: ${docRecord.publishDate}`);
    }

    return parts.join(" | ");
}
</script>

<template>
    <div class="fixed bottom-20 right-4 z-50">
        <!-- Collapsed button -->
        <button
            v-if="!isExpanded"
            type="button"
            class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-lg hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            @click="isExpanded = true"
        >
            🎯 Affinity
        </button>

        <!-- Expanded card -->
        <div
            v-else
            class="flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:w-96"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-700"
            >
                <div>
                    <h2
                        class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                        Affinity Profile
                    </h2>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400">
                        Total Tracked Tags:
                        <span class="font-bold text-slate-900 dark:text-slate-100">
                            {{ decayedEntries.length }}
                        </span>
                    </p>
                </div>
                <button
                    type="button"
                    class="rounded p-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    @click="isExpanded = false"
                >
                    ✕
                </button>
            </div>

            <!-- Content / Table body -->
            <div class="overflow-y-auto p-2">
                <table class="w-full text-left text-xs">
                    <thead
                        class="border-b border-slate-200 text-[10px] uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400"
                    >
                        <tr>
                            <th scope="col" class="px-2 py-1.5">Rank</th>
                            <th scope="col" class="px-2 py-1.5">Title</th>
                            <th scope="col" class="px-2 py-1.5">Score</th>
                            <th scope="col" class="px-2 py-1.5">Tier</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
                        <tr
                            v-for="([tagId, score], index) in decayedEntries"
                            :key="tagId"
                            class="hover:bg-slate-50 dark:hover:bg-slate-700/30"
                        >
                            <td class="whitespace-nowrap px-2 py-1.5 font-medium">
                                {{ index + 1 }}
                            </td>
                            <td
                                class="max-w-[120px] truncate px-2 py-1.5 font-mono text-xs"
                                :title="tagTitleMap.get(tagId) || tagId"
                            >
                                {{ tagTitleMap.get(tagId) || tagId }}
                            </td>
                            <td class="whitespace-nowrap px-2 py-1.5 font-mono">
                                {{ score.toFixed(4) }}
                            </td>
                            <td class="whitespace-nowrap px-2 py-1.5">
                                <span
                                    class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-200"
                                >
                                    {{ getPreviewTier(index + 1) }}
                                </span>
                            </td>
                        </tr>
                        <tr v-if="decayedEntries.length === 0">
                            <td
                                colspan="4"
                                class="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400"
                            >
                                No affinity tags tracked yet.
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- Current Page Tags Section -->
                <div class="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                    <h3
                        class="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                        Current Page Tags
                    </h3>

                    <p
                        v-if="!currentSlug || !currentContent"
                        class="py-2 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                        Not viewing content
                    </p>

                    <p
                        v-else-if="!currentParentTags.length || !currentPageTags.length"
                        class="py-2 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                        This content has no tags
                    </p>

                    <template v-else>
                        <table class="w-full text-left text-xs">
                            <thead
                                class="border-b border-slate-200 text-[10px] uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400"
                            >
                                <tr>
                                    <th scope="col" class="px-2 py-1.5">Title</th>
                                    <th scope="col" class="px-2 py-1.5">Type</th>
                                    <th scope="col" class="px-2 py-1.5">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
                                <tr
                                    v-for="tag in currentPageTags"
                                    :key="tag._id"
                                    class="hover:bg-slate-50 dark:hover:bg-slate-700/30"
                                >
                                    <td
                                        class="max-w-[100px] truncate px-2 py-1.5 font-medium"
                                        :title="tag.title || tag.parentId || tag._id"
                                    >
                                        {{ tag.title || tag.parentId || tag._id }}
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400"
                                    >
                                        {{ tag.parentTagType }}
                                    </td>
                                    <td class="whitespace-nowrap px-2 py-1.5">
                                        <span
                                            v-if="tag.parentTagType === TagType.Topic"
                                            class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                        >
                                            ✓ Counts toward affinity
                                        </span>
                                        <span
                                            v-else
                                            class="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                        >
                                            ✗ Ignored (not a Topic tag)
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div
                            class="mt-3 rounded border p-2 text-xs"
                            :class="
                                isMismatch
                                    ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                            "
                        >
                            <p class="font-medium">
                                Real filterTopicTagIds() result: {{ realTopicFilterResult.length }} of
                                {{ currentParentTags.length }} tag ids survived
                            </p>
                            <p
                                v-if="isMismatch"
                                class="mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400"
                            >
                                ⚠ Mismatch: the real check disagrees with the table above — see console for raw ids
                            </p>
                        </div>

                        <div class="mt-3">
                            <h4
                                class="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
                            >
                                Unresolved Page Tags
                            </h4>
                            <p
                                v-if="!unresolvedTagIds.length"
                                class="py-1 text-[10px] text-slate-500 dark:text-slate-400"
                            >
                                All tags resolved
                            </p>
                            <table v-else class="w-full text-left text-xs">
                                <thead
                                    class="border-b border-slate-200 text-[10px] uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400"
                                >
                                    <tr>
                                        <th scope="col" class="px-2 py-1.5">Tag ID</th>
                                        <th scope="col" class="px-2 py-1.5">Local Storage Status</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
                                    <tr
                                        v-for="id in unresolvedTagIds"
                                        :key="id"
                                        class="hover:bg-slate-50 dark:hover:bg-slate-700/30"
                                    >
                                        <td
                                            class="max-w-[100px] truncate px-2 py-1.5 font-mono text-[10px]"
                                            :title="id"
                                        >
                                            {{ id }}
                                        </td>
                                        <td class="px-2 py-1.5 font-mono text-[10px]">
                                            <span
                                                v-if="!unresolvedDocsMap.get(id)?.length"
                                                class="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                            >
                                                Nothing found locally
                                            </span>
                                            <div v-else class="space-y-1">
                                                <div
                                                    v-for="doc in unresolvedDocsMap.get(id)"
                                                    :key="doc._id"
                                                    class="text-slate-700 dark:text-slate-300"
                                                >
                                                    {{ formatDocDetails(doc) }}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

