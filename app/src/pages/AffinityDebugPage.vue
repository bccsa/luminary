<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { type AffinityProfile } from "luminary-shared";
import { useAffinityDebugData, getPreviewTier } from "@/composables/useAffinityDebugData";
import { loadAffinityProfile } from "@/recommendation/affinityStore";
import { markPageReady } from "@/util/renderState";

const profile = ref<AffinityProfile | undefined>(loadAffinityProfile());
const now = ref(Date.now());
const lastUpdated = ref(new Date().toLocaleTimeString());

function update() {
    profile.value = loadAffinityProfile();
    now.value = Date.now();
    lastUpdated.value = new Date().toLocaleTimeString();
}

onMounted(async () => {
    update();
    window.addEventListener("storage", update);
    const interval = setInterval(update, 1000);

    onUnmounted(() => {
        window.removeEventListener("storage", update);
        clearInterval(interval);
    });

    await nextTick();
    markPageReady();
});

const { decayedEntries, tagTitleMap } = useAffinityDebugData(profile, now);
</script>

<template>
    <div class="min-h-screen bg-slate-50 p-6 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <div class="mx-auto max-w-4xl space-y-6">
            <div>
                <h1 class="text-2xl font-bold tracking-tight">Affinity Profile Debug</h1>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Live view of recommendation affinity scores decaying and updating across tabs.
                </p>
            </div>

            <div
                class="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white p-4 shadow dark:bg-slate-800"
            >
                <div>
                    <span class="text-sm font-medium text-slate-500 dark:text-slate-400"
                        >Total Tracked Tags:</span
                    >
                    <span class="ml-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                        {{ decayedEntries.length }}
                    </span>
                </div>
                <div>
                    <span class="text-sm font-medium text-slate-500 dark:text-slate-400"
                        >Last Updated:</span
                    >
                    <span class="ml-2 font-mono text-sm text-slate-900 dark:text-slate-100">
                        {{ lastUpdated }}
                    </span>
                </div>
            </div>

            <div class="overflow-x-auto rounded-lg bg-white shadow dark:bg-slate-800">
                <table class="w-full text-left text-sm">
                    <thead
                        class="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-300"
                    >
                        <tr>
                            <th scope="col" class="px-4 py-3">Rank</th>
                            <th scope="col" class="px-4 py-3">Title</th>
                            <th scope="col" class="px-4 py-3">Score</th>
                            <th scope="col" class="px-4 py-3">Preview Tier</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                        <tr
                            v-for="([tagId, score], index) in decayedEntries"
                            :key="tagId"
                            class="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        >
                            <td class="whitespace-nowrap px-4 py-3 font-medium">
                                {{ index + 1 }}
                            </td>
                            <td class="px-4 py-3 font-mono text-xs sm:text-sm">
                                {{ tagTitleMap.get(tagId) || tagId }}
                            </td>
                            <td class="whitespace-nowrap px-4 py-3 font-mono">
                                {{ score.toFixed(4) }}
                            </td>
                            <td class="whitespace-nowrap px-4 py-3">
                                <span
                                    class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-200"
                                >
                                    {{ getPreviewTier(index + 1) }}
                                </span>
                            </td>
                        </tr>
                        <tr v-if="decayedEntries.length === 0">
                            <td
                                colspan="4"
                                class="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                            >
                                No affinity tags tracked yet. Browse app content in another tab to
                                generate profile data.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>
