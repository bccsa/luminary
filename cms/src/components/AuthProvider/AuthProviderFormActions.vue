<script setup lang="ts">
import LButton from "../button/LButton.vue";
import LBadge from "../common/LBadge.vue";
import { isConnected } from "luminary-shared";

defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    canDelete: boolean;
    isFormValid: boolean;
    isDirty: boolean;
}>();

const emit = defineEmits<{
    save: [];
    delete: [];
    close: [];
}>();

const handleSave = () => emit("save");
const handleDelete = () => emit("delete");
const handleClose = () => emit("close");
</script>

<template>
    <div class="border-t pt-3">
        <LBadge v-if="!isConnected" variant="warning" withIcon class="mb-2">
            Saving disabled: Unable to save while offline
        </LBadge>
        <div class="flex items-center justify-between pb-3">
            <div>
                <LButton
                    v-if="isEditing && canDelete"
                    @click="handleDelete"
                    variant="secondary"
                    context="danger"
                    size="sm"
                    :disabled="isLoading"
                >
                    Delete
                </LButton>
            </div>
            <div class="flex gap-2">
                <LButton
                    @click="handleClose"
                    variant="secondary"
                    size="sm"
                    :disabled="isLoading"
                >
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    size="sm"
                    @click="handleSave"
                    :disabled="isLoading || !isFormValid || !isDirty || !isConnected"
                    :loading="isLoading"
                >
                    {{ isEditing ? "Update" : "Create" }}
                </LButton>
            </div>
        </div>
    </div>
</template>
