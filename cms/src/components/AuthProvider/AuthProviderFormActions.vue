<script setup lang="ts">
import LButton from "../button/LButton.vue";

defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    canDelete: boolean;
    isFormValid: boolean;
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
    <div class="flex justify-between border-t pt-3">
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
            <LButton @click="handleClose" variant="secondary" size="sm" :disabled="isLoading">
                Cancel
            </LButton>
            <LButton
                variant="primary"
                size="sm"
                @click="handleSave"
                :disabled="isLoading || !isFormValid"
                :loading="isLoading"
            >
                {{ isEditing ? "Update" : "Create" }}
            </LButton>
        </div>
    </div>
</template>
