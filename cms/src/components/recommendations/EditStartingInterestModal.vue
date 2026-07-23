<script setup lang="ts">
import { ref } from "vue";
import { AckStatus, AclPermission, DocType, getAccessibleGroups, type Uuid } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

type Props = {
    tagId: Uuid;
    label: string;
    score: number;
};

const props = defineProps<Props>();
const isVisible = defineModel<boolean>("isVisible");
const isSaving = ref(false);
const { addNotification } = useNotificationStore();

const { current, saveAffinity } = useDefaultAffinity();

const scoreForm = ref(props.score);

function formatScore(score: number) {
    return Math.round(score * 100);
}

function editableMemberOf(): Uuid[] {
    if (current.value?.memberOf?.length) return [...current.value.memberOf];
    return getAccessibleGroups(AclPermission.Edit)[DocType.DefaultAffinity]?.slice(0, 1) ?? [];
}

async function persist(affinity: Record<Uuid, number>, successMessage: string) {
    const memberOf = editableMemberOf();
    if (!memberOf.length) {
        addNotification({
            title: "Can't save these settings",
            description: "You don't have permission to edit this.",
            state: "error",
        });
        return;
    }

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
        addNotification({ title: successMessage, state: "success" });
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

function save() {
    const clamped = Math.min(1, Math.max(0, Number(scoreForm.value) || 0));
    const affinity = { ...(current.value?.affinity ?? {}), [props.tagId]: clamped };
    persist(affinity, "Starting interest saved");
}

function remove() {
    const affinity = { ...(current.value?.affinity ?? {}) };
    delete affinity[props.tagId];
    persist(affinity, "Starting interest removed");
}
</script>

<template>
    <LModal v-model:is-visible="isVisible" :heading="label">
        <div class="space-y-4">
            <div class="text-sm text-zinc-600">
                How interested should a new visitor seem in this topic?
            </div>
            <div class="flex items-center gap-3">
                <input
                    v-model.number="scoreForm"
                    name="starting-interest-score"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    class="h-4 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-800 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-200 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-200 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-800"
                    data-test="starting-interest-score"
                />
                <div class="w-12 text-right text-sm tabular-nums text-zinc-700">
                    {{ formatScore(scoreForm) }}%
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-between gap-2">
                <LButton
                    variant="muted"
                    :disabled="isSaving"
                    @click="remove"
                    data-test="starting-interest-remove"
                >
                    Remove
                </LButton>
                <div class="flex gap-2">
                    <LButton
                        variant="secondary"
                        @click="isVisible = false"
                        data-test="starting-interest-cancel"
                    >
                        Cancel
                    </LButton>
                    <LButton
                        variant="primary"
                        :icon="isSaving ? LoadingSpinner : undefined"
                        :disabled="isSaving"
                        @click="save"
                        data-test="starting-interest-save"
                    >
                        {{ isSaving ? "Saving..." : "Save" }}
                    </LButton>
                </div>
            </div>
        </template>
    </LModal>
</template>
