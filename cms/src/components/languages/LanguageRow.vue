<script setup lang="ts">
import { db, DocType, type LanguageDto, AclPermission, verifyAccess } from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";

type Props = {
    languagesDoc: LanguageDto;
};

defineProps<Props>();
</script>

<template>
    <tr>
        <!-- name -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            {{ languagesDoc.name }}
        </td>

        <!-- status -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <!-- <LBadge variant="warning"> Offline changes </LBadge> -->
        </td>

        <!-- languag code -->
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
                v-if="verifyAccess(languagesDoc.memberOf, DocType.Language, AclPermission.View)"
                variant="tertiary"
                :icon="
                    verifyAccess(languagesDoc.memberOf, DocType.Language, AclPermission.Edit)
                        ? PencilSquareIcon
                        : EyeIcon
                "
                :is="RouterLink"
                :to="{ name: 'edit language', params: { id: languagesDoc._id } }"
                class="flex justify-end"
                data-test="edit-button"
            ></LButton>
        </td>
    </tr>
</template>
