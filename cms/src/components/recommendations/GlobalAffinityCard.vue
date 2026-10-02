<script setup lang="ts">
import { computed, ref } from "vue";
import { AckStatus, AclPermission, DocType, getAccessibleGroups } from "luminary-shared";
import { useGlobalAffinity } from "@/composables/useGlobalAffinity";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import { useTopicTagOptions } from "@/composables/useTopicTagOptions";
import { useNotificationStore } from "@/stores/notification";
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LCard from "@/components/common/LCard.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

/** How many of the strongest community topics the copy action seeds the baseline with. */
const SEED_TOP_N = 20;

const { affinity, contributionCount, lastUpdatedUtc, isLoading } = useGlobalAffinity();
const { current: defaultAffinityDoc, saveAffinity } = useDefaultAffinity();
const { tagLabel } = useTopicTagOptions();
const { addNotification } = useNotificationStore();

const isSeeding = ref(false);

const canEditDefault = computed(
    () => (getAccessibleGroups(AclPermission.Edit)[DocType.DefaultAffinity] ?? []).length > 0,
);

const entries = computed(() =>
    Object.entries(affinity.value)
        .map(([tagId, score]) => ({ tagId, score, label: tagLabel(tagId) }))
        .sort((a, b) => b.score - a.score),
);

// Community scores are tiny in absolute terms and grow with adoption, so a raw percentage
// would read as "nobody is interested in anything". Show each topic relative to the
// strongest one, which is the only comparison that means anything here.
const topScore = computed(() => entries.value[0]?.score ?? 0);
const relative = (score: number) =>
    topScore.value > 0 ? Math.round((score / topScore.value) * 100) : 0;

const lastUpdatedLabel = computed(() =>
    lastUpdatedUtc.value ? new Date(lastUpdatedUtc.value).toLocaleString() : "Never",
);

function editableMemberOf(): string[] {
    if (defaultAffinityDoc.value?.memberOf?.length) return [...defaultAffinityDoc.value.memberOf];
    return getAccessibleGroups(AclPermission.Edit)[DocType.DefaultAffinity]?.slice(0, 1) ?? [];
}

/**
 * Copy the strongest community topics into the cold-start baseline. Scores are rescaled
 * relative to the strongest topic so they land on the 0-1 scale the baseline expects.
 */
async function useAsStartingInterests() {
    const memberOf = editableMemberOf();
    if (!memberOf.length) {
        addNotification({
            title: "Can't use these interests",
            description: "You don't have permission to edit the starting interests.",
            state: "error",
        });
        return;
    }

    isSeeding.value = true;
    try {
        const seeded = Object.fromEntries(
            entries.value
                .slice(0, SEED_TOP_N)
                .map((entry) => [entry.tagId, relative(entry.score) / 100]),
        );
        const res = await saveAffinity(seeded, memberOf);
        if (res && res.ack === AckStatus.Rejected) {
            addNotification({
                title: "Can't use these interests",
                description: res.message || "The server rejected the update.",
                state: "error",
            });
            return;
        }
        addNotification({
            title: "Starting interests updated",
            description: `Copied the top ${Math.min(SEED_TOP_N, entries.value.length)} community topics.`,
            state: "success",
        });
    } catch (error) {
        addNotification({
            title: "Can't use these interests",
            description: error instanceof Error ? error.message : "The change could not be saved.",
            state: "error",
        });
    } finally {
        isSeeding.value = false;
    }
}
</script>

<template>
    <LCard title="What the audience is interested in">
        <div class="space-y-3">
            <div class="text-sm text-zinc-600">
                Built up from what everyone using the app reads, watches and saves. Each person
                counts once, so no single reader can swing it.
            </div>

            <div v-if="isLoading" class="py-4 text-center text-sm text-zinc-500">Loading...</div>

            <div v-else-if="!entries.length" class="py-4 text-sm text-zinc-500">
                Nothing yet. People only start counting once their group has "Contribute" on Global
                affinity, and once they've used the app enough to have a clear interest — see
                "Actions needed before someone counts" in the recommendation settings.
            </div>

            <template v-else>
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span data-test="global-affinity-contributions">
                        Contributions: {{ contributionCount.toLocaleString() }}
                    </span>
                    <span>Last updated: {{ lastUpdatedLabel }}</span>
                </div>

                <ul class="divide-y divide-zinc-100">
                    <li
                        v-for="entry in entries"
                        :key="entry.tagId"
                        class="flex items-center justify-between gap-2 py-1.5 text-sm"
                        data-test="global-affinity-entry"
                    >
                        <span class="truncate text-zinc-900">{{ entry.label }}</span>
                        <LBadge>{{ relative(entry.score) }}%</LBadge>
                    </li>
                </ul>
            </template>
        </div>

        <template #footer>
            <div class="flex justify-end">
                <LButton
                    v-if="canEditDefault && entries.length"
                    variant="secondary"
                    :icon="isSeeding ? LoadingSpinner : undefined"
                    :disabled="isSeeding"
                    @click="useAsStartingInterests"
                    data-test="global-affinity-use-as-starting"
                >
                    {{ isSeeding ? "Saving..." : "Use as starting interests" }}
                </LButton>
            </div>
        </template>
    </LCard>
</template>
