<script setup lang="ts">
import { computed, ref } from "vue";
import { AckStatus, AclPermission, DocType, getAccessibleGroups, type Uuid } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import { useTopicTagOptions } from "@/composables/useTopicTagOptions";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LSlider from "@/components/forms/LSlider.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

type Props = {
    /** Present in edit mode (editing an existing entry); absent in add mode. */
    tagId?: Uuid;
    label?: string;
    score?: number;
};

const props = defineProps<Props>();
const isEdit = computed(() => props.tagId !== undefined);

const isVisible = defineModel<boolean>("isVisible");
const isSaving = ref(false);
const { addNotification } = useNotificationStore();

const { current, saveAffinity } = useDefaultAffinity();
const { tagOptions } = useTopicTagOptions();

const selectedTagId = ref<Uuid>();
const scoreForm = ref(props.score ?? 0.3);

const availableTagOptions = computed(() => {
    const existingIds = new Set(Object.keys(current.value?.affinity ?? {}));
    return tagOptions.value.filter((option) => !existingIds.has(option.id));
});

const tagSelectOptions = computed(() =>
    availableTagOptions.value.map((option) => ({ label: option.label, value: option.id })),
);

const heading = computed(() => (isEdit.value ? props.label! : "Add a starting interest"));

function formatScore(score: number) {
    return `${Math.round(score * 100)}%`;
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
    const tagId = isEdit.value ? props.tagId : selectedTagId.value;
    if (!tagId) return;

    const clamped = Math.min(1, Math.max(0, Number(scoreForm.value) || 0));
    const affinity = { ...(current.value?.affinity ?? {}), [tagId]: clamped };
    persist(affinity, isEdit.value ? "Starting interest saved" : "Starting interest added");
}

function remove() {
    const affinity = { ...(current.value?.affinity ?? {}) };
    delete affinity[props.tagId!];
    persist(affinity, "Starting interest removed");
}
</script>

<template>
    <LModal v-model:is-visible="isVisible" :heading="heading">
        <div class="space-y-4">
            <div class="text-sm text-zinc-600">
                {{
                    isEdit
                        ? "How interested should a new visitor seem in this topic?"
                        : "Pick a topic and how interested a new visitor should seem in it."
                }}
            </div>

            <LSelect
                v-if="!isEdit"
                v-model="selectedTagId"
                label="Topic"
                placeholder="No topics available"
                :options="tagSelectOptions"
            />

            <LSlider
                v-model="scoreForm"
                name="starting-interest-score"
                :format-value="formatScore"
            />
        </div>

        <template #footer>
            <div class="flex gap-2" :class="isEdit ? 'justify-between' : 'justify-end'">
                <LButton
                    v-if="isEdit"
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
                        :disabled="(!isEdit && !selectedTagId) || isSaving"
                        :icon="isSaving ? LoadingSpinner : undefined"
                        @click="save"
                        data-test="starting-interest-save"
                    >
                        {{ isSaving ? (isEdit ? "Saving..." : "Adding...") : isEdit ? "Save" : "Add" }}
                    </LButton>
                </div>
            </div>
        </template>
    </LModal>
</template>
