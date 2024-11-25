<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageTable from "@/components/languages/LanguageTable.vue";
import LButton from "@/components/button/LButton.vue";
import { AclPermission, DocType, hasAnyPermission } from "luminary-shared";
import { computed, ref } from "vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import CreateLanguageModal from "@/components/languages/CreateOrEditLanguageModal.vue";

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
</script>

<template>
    <BasePage title="Language overview">
        <template #actions>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="openCreateModal"
                    name="createLanguageBtn"
                >
                    Create language
                </LButton>
            </div>
        </template>

        <LanguageTable />

        <!-- Include the modal -->
        <CreateLanguageModal
            v-if="isModalVisible"
            :isVisible="isModalVisible"
            @close="closeModal"
        />
    </BasePage>
</template>
