<script setup lang="ts">
import { computed, ref } from "vue";
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import FilterOptions from "@/components/common/FilterOptions.vue";
import EmptyState from "@/components/EmptyState.vue";
import StartingInterestCard from "@/components/recommendations/StartingInterestCard.vue";
import AddStartingInterestModal from "@/components/recommendations/AddStartingInterestModal.vue";
import AffinityConfigModal from "@/components/recommendations/AffinityConfigModal.vue";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import { useTopicTagOptions } from "@/composables/useTopicTagOptions";
import { isSmallScreen } from "@/globalConfig";
import { AclPermission, DocType, hasAnyPermission } from "luminary-shared";
import { PlusIcon, AdjustmentsHorizontalIcon } from "@heroicons/vue/20/solid";

const { current, isLoading } = useDefaultAffinity();
const { tagLabel } = useTopicTagOptions();

const canEdit = computed(() => hasAnyPermission(DocType.DefaultAffinity, AclPermission.Edit));

const searchTerm = ref("");
const showAddModal = ref(false);
const showAffinityConfigModal = ref(false);

const entries = computed(() =>
    Object.entries(current.value?.affinity ?? {})
        .map(([tagId, score]) => ({ tagId, score, label: tagLabel(tagId) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
);

const hasAnyContent = computed(() => entries.value.length > 0);

const filteredEntries = computed(() => {
    const search = searchTerm.value.trim().toLowerCase();
    if (!search) return entries.value;
    return entries.value.filter((entry) => entry.label.toLowerCase().includes(search));
});
</script>

<template>
    <BasePage title="Recommendations" :is-full-width="true" :loading="isLoading">
        <template #topBarActionsDesktop>
            <div v-if="!isSmallScreen" class="flex gap-2">
                <LButton
                    v-if="canEdit"
                    variant="secondary"
                    :icon="AdjustmentsHorizontalIcon"
                    @click="showAffinityConfigModal = true"
                    data-test="openAffinityConfigModal"
                >
                    Recommendation settings
                </LButton>
                <LButton
                    v-if="canEdit && hasAnyContent"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="showAddModal = true"
                    data-test="openAddStartingInterestModal"
                >
                    Add starting interest
                </LButton>
            </div>
        </template>
        <template #topBarActionsMobile>
            <div v-if="isSmallScreen" class="flex gap-2">
                <AdjustmentsHorizontalIcon
                    v-if="canEdit"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="showAffinityConfigModal = true"
                    data-test="openAffinityConfigModal"
                />
                <PlusIcon
                    v-if="canEdit && hasAnyContent"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="showAddModal = true"
                    data-test="openAddStartingInterestModal"
                />
            </div>
        </template>

        <template v-if="hasAnyContent" #internalPageHeader>
            <FilterOptions v-model:search="searchTerm" search-placeholder="Search interests..." />
        </template>

        <div class="flex flex-col gap-[3px]">
            <p v-if="hasAnyContent" class="mb-2 px-2 py-1 text-sm text-zinc-500">
                Topics new visitors are shown an interest in, before they've built up any interests
                of their own.
            </p>

            <StartingInterestCard
                v-for="entry in filteredEntries"
                :key="entry.tagId"
                :tagId="entry.tagId"
                :label="entry.label"
                :score="entry.score"
                :updated-time-utc="current?.updatedTimeUtc ?? 0"
            />

            <EmptyState
                v-if="!isLoading && !hasAnyContent"
                title="No starting interests yet"
                description="Add a topic to choose what new visitors are shown before they've built up their own interests."
                :button-text="canEdit ? 'Add starting interest' : undefined"
                :button-action="canEdit ? () => (showAddModal = true) : undefined"
                :button-permission="canEdit"
                show-back-button
            />

            <EmptyState
                v-else-if="hasAnyContent && filteredEntries.length === 0"
                title="No interests found"
                description="No starting interests match your search."
            />
        </div>

        <AddStartingInterestModal v-if="showAddModal" v-model:is-visible="showAddModal" />
        <AffinityConfigModal
            v-if="showAffinityConfigModal"
            v-model:is-visible="showAffinityConfigModal"
        />
    </BasePage>
</template>
