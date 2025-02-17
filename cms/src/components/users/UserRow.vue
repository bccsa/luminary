<script setup lang="ts">
import {
    db,
    DocType,
    type UserDto,
    AclPermission,
    verifyAccess,
    type GroupDto,
} from "luminary-shared";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import LBadge from "../common/LBadge.vue";
import { ref, watch } from "vue";

type Props = {
    usersDoc: UserDto;
};
const props = defineProps<Props>();

const isLocalChanges = db.isLocalChangeAsRef(props.usersDoc._id);

const groups = db.whereTypeAsRef<GroupDto[]>(DocType.Group);
const group = ref<GroupDto[]>([]);

watch(groups, (newGroups) => {
    group.value = newGroups.filter((g) => props.usersDoc.memberOf.includes(g._id));
});
</script>

<template>
    <tr>
        <!-- name -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <div class="flex gap-2">
                {{ usersDoc.name }}
            </div>
        </td>

        <!-- email -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <div class="flex gap-2">
                <!-- <LBadge v-if="usersDoc.default" variant="success">Default</LBadge> -->
                {{ usersDoc.email }}
            </div>
        </td>

        <!-- memberof -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <LBadge class="flex flex-wrap">
                {{
                    usersDoc.memberOf.map((g) => group.find((gr) => gr._id === g)?.name).join(" - ")
                }}
            </LBadge>
        </td>

        <!-- isLocalChanges -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <div class="flex gap-2">
                <LBadge v-if="isLocalChanges" variant="warning">Offline changes</LBadge>
            </div>
        </td>

        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(usersDoc.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LButton
                variant="tertiary"
                :icon="
                    verifyAccess(usersDoc.memberOf, DocType.User, AclPermission.Edit)
                        ? PencilSquareIcon
                        : EyeIcon
                "
                @click="$router.push({ name: 'user', params: { id: usersDoc._id } })"
                class="flex justify-end"
            ></LButton>
        </td>
    </tr>
</template>
