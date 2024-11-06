<script setup lang="ts">
import { ref } from "vue";
import { db, DocType, AclPermission, verifyAccess, type RedirectDto } from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";

type Props = {
    redirectDoc: RedirectDto;
};
const props = defineProps<Props>();

const isLocalChanges = db.isLocalChangeAsRef(props.redirectDoc._id);
const isModalVisible = ref(false);
</script>

<template>
    <tr>
        <!-- From Slug -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            {{ redirectDoc.slug }}
        </td>

        <!-- To Slug -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            {{ redirectDoc.toSlug ?? "HOMEPAGE" }}
        </td>

        <!-- Type -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-6">
            <LBadge>{{ redirectDoc.redirectType.toLocaleUpperCase() }}</LBadge>
        </td>

        <!-- status -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <!-- Optional status handling -->
            <LBadge v-if="isLocalChanges" variant="warning">Offline changes</LBadge>
        </td>

        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-6">
            {{ db.toDateTime(redirectDoc.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 text-sm font-medium text-zinc-700 sm:pl-6"
        >
            <LButton
                variant="tertiary"
                :icon="
                    verifyAccess(redirectDoc.memberOf, DocType.Redirect, AclPermission.Edit)
                        ? PencilSquareIcon
                        : EyeIcon
                "
                @click="isModalVisible = true"
                class="flex justify-end"
            ></LButton>
        </td>
    </tr>

    <!-- Modal for editing the Redirect -->
    <CreateOrEditRedirectModal
        v-if="isModalVisible"
        :isVisible="isModalVisible"
        :redirect="redirectDoc"
        @close="isModalVisible = false"
    />
</template>
