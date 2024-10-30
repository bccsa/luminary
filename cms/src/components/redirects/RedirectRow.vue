<script setup lang="ts">
import { ref } from "vue";
import { db, DocType, AclPermission, verifyAccess, type RedirectDto } from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
// import CreateLanguageModal from "./CreateOrEditLanguageModal.vue";
import { useNotificationStore } from "@/stores/notification";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";
type Props = {
    redirectDoc: RedirectDto;
};
const props = defineProps<Props>();
// Create a local copy of redirectDoc for editing
const editableRedirectDoc = ref({ ...props.redirectDoc });
const isLocalChanges = db.isLocalChangeAsRef(props.redirectDoc._id);
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
// Function to handle redirect update
const handleRedirectUpdate = (updatedRedirect: RedirectDto) => {
    editableRedirectDoc.value = {
        ...updatedRedirect,
        memberOf: [...updatedRedirect.memberOf], // Update the local state with the updated language by cloning deeply the array here as well
    };
    closeModal();
    useNotificationStore().addNotification({
        title: `${editableRedirectDoc.value.toSlug} redirect updated`,
        description: `The redirect has been updated successfully`,
        state: "success",
    });
};
</script>

<template>
    <tr>
        <!-- From Slug -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            {{ redirectDoc.slug }}
        </td>

        <!-- status -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <!-- Optional status handling -->
            <LBadge v-if="isLocalChanges" variant="warning">Offline changes</LBadge>
        </td>

        <!-- Type -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <LBadge>{{ redirectDoc.redirectType.toLocaleUpperCase() }} </LBadge>
        </td>

        <!-- To Slug -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <LBadge>{{
                redirectDoc.toSlug?.length! > 0
                    ? redirectDoc.toSlug!.toLocaleUpperCase()
                    : "HOMEPAGE"
            }}</LBadge>
        </td>

        <!-- To Url -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <LBadge>{{
                redirectDoc.toUrl?.length! > 0 ? redirectDoc.toUrl!.toLocaleUpperCase() : "HOMEPAGE"
            }}</LBadge>
        </td>

        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(redirectDoc.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LButton
                variant="tertiary"
                :icon="
                    verifyAccess(redirectDoc.memberOf, DocType.Redirect, AclPermission.Edit)
                        ? PencilSquareIcon
                        : EyeIcon
                "
                @click="openEditModal"
                class="flex justify-end"
            ></LButton>
        </td>
    </tr>

    <!-- Modal for editing the Redirect -->
    <CreateOrEditRedirectModal
        v-if="isModalVisible"
        :isVisible="isModalVisible"
        :redirect="redirectDoc"
        @close="closeModal"
        @updated="handleRedirectUpdate"
    />
</template>
