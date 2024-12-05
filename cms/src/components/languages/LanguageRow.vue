<script setup lang="ts">
import { db, DocType, type LanguageDto, AclPermission, verifyAccess } from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { CheckCircleIcon, EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";

type Props = {
    languagesDoc: LanguageDto;
};
const props = defineProps<Props>();

const isLocalChanges = db.isLocalChangeAsRef(props.languagesDoc._id);
</script>

<template>
    <tr>
        <!-- name -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <div class="flex gap-2">
                {{ languagesDoc.name }}
                <CheckCircleIcon v-if="languagesDoc.default" class="h-5 w-5" />
            </div>
        </td>

        <!-- status -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <!-- Optional status handling -->
            <LBadge v-if="isLocalChanges" variant="warning">Offline changes</LBadge>
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
                @click="$router.push({ name: 'translation', params: { id: languagesDoc._id } })"
                class="flex justify-end"
            ></LButton>
        </td>
    </tr>
</template>
