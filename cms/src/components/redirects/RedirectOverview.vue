<script setup lang="ts">
import { AclPermission, DocType, hasAnyPermission, type RedirectDto } from "luminary-shared";
import BasePage from "../BasePage.vue";
import RedirectTable from "./RedirectTable.vue";
import { useNotificationStore } from "@/stores/notification";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";
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
const handleRedirectCreated = (newRedirect: RedirectDto) => {
    closeModal();
    useNotificationStore().addNotification({
        title: `${newRedirect.slug} redirect created`,
        description: `The new redirect has been created successfully`,
        state: "success",
    });
};
</script>

<template>
    <BasePage title="Redirect Overview">
        <template #actions>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="openCreateModal"
                    name="createLanguageBtn"
                >
                    Create Redirect
                </LButton>
            </div>
        </template>

        <RedirectTable />

        <CreateOrEditRedirectModal
            v-if="isModalVisible"
            :isVisible="isModalVisible"
            @close="closeModal"
            @created="handleRedirectCreated"
        />
    </BasePage>
</template>
