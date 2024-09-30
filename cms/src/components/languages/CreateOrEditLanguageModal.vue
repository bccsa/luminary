<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { db, DocType, type LanguageDto } from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import GroupSelector from "../groups/GroupSelector.vue";

// Props for visibility and language to edit
type Props = {
    isVisible: boolean;
    language?: LanguageDto;
};
const props = defineProps<Props>();

// Emit events to close the modal and trigger creation or update
const emit = defineEmits(["close", "created", "updated"]);

// New language or edited language object
const newLanguage = ref<LanguageDto>({
    _id: db.uuid(), // Generate new ID for create mode
    name: "New Language",
    languageCode: "",
    memberOf: [],
    type: DocType.Language,
    updatedTimeUtc: Date.now(),
});

// Watch the passed `language` prop to set the modal in edit mode
watch(
    () => props.language,
    (newLang) => {
        if (newLang) {
            newLanguage.value = { ...newLang };
        } else {
            // Reset to a new language if no language is passed (create mode)
            newLanguage.value = {
                _id: db.uuid(),
                name: "",
                languageCode: "",
                memberOf: [],
                type: DocType.Language,
                updatedTimeUtc: Date.now(),
            };
        }
    },
    { immediate: true },
);

// Check if we are in edit mode (if a language is passed)
const isEditMode = computed(() => !!props.language);

// Function to handle creation or update
const saveLanguage = async () => {
    // Update the timestamp
    newLanguage.value.updatedTimeUtc = Date.now();

    // Deep clone the `memberOf` array to avoid DataCloneError
    const clonedLanguage = {
        ...newLanguage.value,
        memberOf: [...newLanguage.value.memberOf],
    };

    // Save the cloned language object to the database
    await db.upsert(clonedLanguage);

    if (isEditMode.value) {
        emit("updated", clonedLanguage); // Emit update event if editing
    } else {
        emit("created", clonedLanguage); // Emit create event if creating
    }

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
            <!-- Dynamic title based on mode -->
            <h2 class="mb-4 text-xl font-bold">
                {{ isEditMode ? "Edit Language" : "Create New Language" }}
            </h2>

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

            <div class="flex justify-end gap-4 pt-5">
                <LButton variant="secondary" @click="closeModal">Cancel</LButton>
                <LButton variant="primary" @click="saveLanguage">
                    {{ isEditMode ? "Save Changes" : "Create" }}
                </LButton>
            </div>
        </div>
    </div>
</template>
