<script setup lang="ts">
import LButton from "../button/LButton.vue";
import LBadge from "../common/LBadge.vue";
import { isConnected } from "luminary-shared";
import { ArrowUturnLeftIcon } from "@heroicons/vue/24/solid";

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
    duplicate: [];
    close: [];
    revert: [];
}>();

const handleSave = () => emit("save");
const handleDelete = () => emit("delete");
const handleDuplicate = () => emit("duplicate");
const handleClose = () => emit("close");
const handleRevert = () => emit("revert");
</script>

<template>
    <div class="border-t pt-3">
        <LBadge v-if="!isConnected" variant="warning" withIcon class="mb-2">
            Saving disabled: Unable to save while offline
        </LBadge>
        <LBadge v-if="isEditing && isDirty" variant="warning" withIcon class="mb-2">
            Unsaved changes
        </LBadge>
        <div class="flex items-center justify-between pb-3">
            <div class="flex gap-2">
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
                <LButton
                    v-if="isEditing"
                    @click="handleDuplicate"
                    variant="secondary"
                    size="sm"
                    :disabled="isLoading"
                >
                    Duplicate
                </LButton>
                <LButton
                    v-if="isEditing && isDirty"
                    variant="secondary"
                    size="sm"
                    :icon="ArrowUturnLeftIcon"
                    smallIcon
                    @click="handleRevert"
                    :disabled="isLoading"
                >
                    Revert
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
                    Save
                </LButton>
            </div>
        </div>
    </div>
</template>
