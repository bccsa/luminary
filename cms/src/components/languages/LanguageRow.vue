<script setup lang="ts">
import { ref } from "vue";
import { db, DocType, type LanguageDto, AclPermission, verifyAccess } from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import CreateLanguageModal from "./CreateOrEditLanguageModal.vue";
import { useNotificationStore } from "@/stores/notification";

type Props = {
    languagesDoc: LanguageDto;
};
const props = defineProps<Props>();

// Create a local copy of languagesDoc for editing
const editableLanguageDoc = ref({ ...props.languagesDoc });

// State for modal visibility
const isModalVisible = ref(false);

// Function to handle opening the modal for editing
const openEditModal = () => {
    isModalVisible.value = true;
};

// Function to handle closing the modal
const closeModal = () => {
    isModalVisible.value = false;
};

// Function to handle language update
const handleLanguageUpdated = (updatedLanguage: LanguageDto) => {
    editableLanguageDoc.value = {
        ...updatedLanguage,
        memberOf: [...updatedLanguage.memberOf], // Update the local state with the updated language by cloning deeply the array here as well
    };
    closeModal();

    useNotificationStore().addNotification({
        title: `${updatedLanguage.name} language updated`,
        description: `The language has been updated successfully`,
        state: "success",
    });
};
</script>

<template>
    <tr>
        <!-- name -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            {{ languagesDoc.name }}
        </td>

        <!-- status -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <!-- Optional status handling -->
        </td>

        <!-- language code -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <LBadge>{{ languagesDoc.languageCode.toLocaleUpperCase() }} </LBadge>
        </td>

        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(languagesDoc.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LButton
                variant="tertiary"
                :icon="
                    verifyAccess(languagesDoc.memberOf, DocType.Language, AclPermission.Edit)
                        ? PencilSquareIcon
                        : EyeIcon
                "
                @click="openEditModal"
                class="flex justify-end"
            ></LButton>
        </td>
    </tr>

    <!-- Modal for editing the language -->
    <CreateLanguageModal
        v-if="isModalVisible"
        :isVisible="isModalVisible"
        :language="languagesDoc"
        @close="closeModal"
        @updated="handleLanguageUpdated"
    />
</template>
