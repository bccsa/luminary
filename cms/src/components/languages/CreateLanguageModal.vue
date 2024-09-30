<script setup lang="ts">
import { ref } from "vue";
import { db, DocType, type LanguageDto } from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import GroupSelector from "../groups/GroupSelector.vue";

// Props to control visibility
type Props = {
    isVisible: boolean;
};
defineProps<Props>();

// Emit events to close the modal and trigger creation
const emit = defineEmits(["close", "created"]);

// New language object
const newLanguage = ref<LanguageDto>({
    _id: db.uuid(),
    name: "",
    languageCode: "",
    memberOf: [],
    type: DocType.Language,
    updatedTimeUtc: Date.now(),
});

// Function to handle creation
const createLanguage = async () => {
    await db.upsert(newLanguage.value);
    emit("created", newLanguage.value);
    closeModal();
};

// Function to close the modal
const closeModal = () => {
    emit("close");
};
</script>

<template>
    <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
        <div class="w-96 rounded-lg bg-white p-6 shadow-lg">
            <h2 class="mb-4 text-xl font-bold">Create New Language</h2>

            <LInput
                label="Name"
                name="languageName"
                v-model="newLanguage.name"
                class="mb-4 w-full"
                placeholder="Enter language name"
            />

            <LInput
                label="Code"
                name="languageCode"
                v-model="newLanguage.languageCode"
                class="mb-4 w-full"
                placeholder="Enter language code"
            />

            <GroupSelector v-model:groups="newLanguage.memberOf" :docType="DocType.Language" />

            <div class="flex justify-end gap-4">
                <LButton variant="secondary" @click="closeModal">Cancel</LButton>
                <LButton variant="primary" @click="createLanguage">Create</LButton>
            </div>
        </div>
    </div>
</template>
