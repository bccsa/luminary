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

type Props = {
    groups: GroupDto[];
    usersDoc: UserDto;
};
const props = defineProps<Props>();

const isLocalChanges = db.isLocalChangeAsRef(props.usersDoc._id);
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
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-3">
            <div class="flex gap-2">
                <!-- <LBadge v-if="usersDoc.default" variant="success">Default</LBadge> -->
                {{ usersDoc.email }}
            </div>
        </td>

        <!-- memberof -->
        <td class="py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <div class="flex max-w-xs flex-wrap gap-2">
                <LBadge v-for="group in groups" :key="group._id" type="default" class="text-lg">
                    {{ group.name }}
                </LBadge>
            </div>
        </td>

        <!-- isLocalChanges -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-3">
            <div class="flex gap-2">
                <LBadge v-if="isLocalChanges" variant="warning">Offline changes</LBadge>
            </div>
        </td>

        <!-- Last Logged In -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{
                usersDoc.lastLogin
                    ? db.toDateTime(usersDoc.lastLogin).toLocaleString(DateTime.DATETIME_SHORT)
                    : "Has not logged in yet"
            }}
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
