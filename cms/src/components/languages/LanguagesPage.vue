<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageTable from "@/components/languages/LanguageTable.vue";
import LButton from "@/components/button/LButton.vue";
import { AclPermission, DocType, hasAnyPermission, type LanguageDto } from "luminary-shared";
import { computed, ref } from "vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import CreateLanguageModal from "@/components/languages/CreateLanguageModal.vue";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));

// State to control modal visibility
const isModalVisible = ref(false);

// Function to open the modal
const openCreateModal = () => {
    isModalVisible.value = true;
};

// Function to handle modal close
const closeModal = () => {
    isModalVisible.value = false;
};

// Handle after a new language is created
const handleLanguageCreated = (newLanguage: LanguageDto) => {
    closeModal();
    console.log("New language created:", newLanguage);
    // Optionally reload the language table or add the new language to the table
};

const handleLanguageUpdated = (updatedLanguage: LanguageDto) => {
    console.log("Language updated:", updatedLanguage);

    // Optionally reload the language table or update the language in the table
};
</script>

<template>
    <BasePage title="Language overview">
        <template #actions>
            <div class="flex gap-4">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="openCreateModal"
                >
                    Create Language
                </LButton>
            </div>
        </template>

        <LanguageTable />

        <!-- Include the modal -->
        <CreateLanguageModal
            v-if="isModalVisible"
            :isVisible="isModalVisible"
            @close="closeModal"
            @created="handleLanguageCreated"
            @updated="handleLanguageUpdated"
        />
    </BasePage>
</template>
