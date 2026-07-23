<script setup lang="ts">
import { computed, ref } from "vue";
import { AckStatus, AclPermission, DocType, getAccessibleGroups, type Uuid } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import { useTopicTagOptions } from "@/composables/useTopicTagOptions";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

const isVisible = defineModel<boolean>("isVisible");
const isSaving = ref(false);
const { addNotification } = useNotificationStore();

const { current, saveAffinity } = useDefaultAffinity();
const { tagOptions } = useTopicTagOptions();

const selectedTagId = ref<Uuid>();
const scoreForm = ref(0.3);

const availableTagOptions = computed(() => {
    const existingIds = new Set(Object.keys(current.value?.affinity ?? {}));
    return tagOptions.value.filter((option) => !existingIds.has(option.id));
});

const tagSelectOptions = computed(() =>
    availableTagOptions.value.map((option) => ({ label: option.label, value: option.id })),
);

function formatScore(score: number) {
    return Math.round(score * 100);
}

function editableMemberOf(): Uuid[] {
    if (current.value?.memberOf?.length) return [...current.value.memberOf];
    return getAccessibleGroups(AclPermission.Edit)[DocType.DefaultAffinity]?.slice(0, 1) ?? [];
}

async function save() {
    if (!selectedTagId.value) return;

    const memberOf = editableMemberOf();
    if (!memberOf.length) {
        addNotification({
            title: "Can't save these settings",
            description: "You don't have permission to edit this.",
            state: "error",
        });
        return;
    }

    const clamped = Math.min(1, Math.max(0, Number(scoreForm.value) || 0));
    const affinity = { ...(current.value?.affinity ?? {}), [selectedTagId.value]: clamped };

    isSaving.value = true;
    try {
        const res = await saveAffinity(affinity, memberOf);
        if (res && res.ack === AckStatus.Rejected) {
            addNotification({
                title: "Can't save these settings",
                description: res.message || "The server rejected the update.",
                state: "error",
            });
            return;
        }
        addNotification({ title: "Starting interest added", state: "success" });
        isVisible.value = false;
    } catch (error) {
        addNotification({
            title: "Can't save these settings",
            description: error instanceof Error ? error.message : "The change could not be saved.",
            state: "error",
        });
    } finally {
        isSaving.value = false;
    }
}
</script>

<template>
    <LModal v-model:is-visible="isVisible" heading="Add a starting interest">
        <div class="space-y-4">
            <div class="text-sm text-zinc-600">
                Pick a topic and how interested a new visitor should seem in it.
            </div>

            <LSelect
                v-model="selectedTagId"
                label="Topic"
                placeholder="No topics available"
                :options="tagSelectOptions"
            />

            <div class="flex items-center gap-3">
                <input
                    v-model.number="scoreForm"
                    name="add-starting-interest-score"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    class="h-4 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-800 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-200 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-200 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-800"
                    data-test="add-starting-interest-score"
                />
                <div class="w-12 text-right text-sm tabular-nums text-zinc-700">
                    {{ formatScore(scoreForm) }}%
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2">
                <LButton
                    variant="secondary"
                    @click="isVisible = false"
                    data-test="add-starting-interest-cancel"
                >
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    :disabled="!selectedTagId || isSaving"
                    :icon="isSaving ? LoadingSpinner : undefined"
                    @click="save"
                    data-test="add-starting-interest-save"
                >
                    {{ isSaving ? "Adding..." : "Add" }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
