<script setup lang="ts">
import { type GroupAclEntryDto, AclPermission, type GroupDto } from "luminary-shared";
import { defineModel, defineProps, toRaw } from "vue";
import { capitaliseFirstLetter } from "@/util/string";
import { isPermissionAvailable, hasChangedPermission, validateAclEntry } from "./permissions";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import _ from "lodash";

type Props = {
    /**
     * Original data from database for visual marking of changes
     */
    originalGroup: GroupDto;
    disabled: boolean;
};
defineProps<Props>();
const aclEntry = defineModel<GroupAclEntryDto>("aclEntry");

const setPermission = (aclPermission: AclPermission) => {
    if (!aclEntry.value) return;

    const prev = _.cloneDeep(toRaw(aclEntry.value));

    // Add or remove permission
    const i = aclEntry.value.permission.indexOf(aclPermission);
    if (i >= 0) {
        aclEntry.value.permission.splice(i, 1);
        validateAclEntry(aclEntry.value, prev);
        return;
    }

    aclEntry.value.permission.push(aclPermission);
    validateAclEntry(aclEntry.value, prev);
};
</script>

<template>
    <tr v-if="aclEntry" class="border-b border-zinc-200 last:border-none">
        <th scope="row" class="py-3 pl-6 pr-10 text-left font-medium">
            {{ capitaliseFirstLetter(aclEntry.type) }}
        </th>
        <td
            v-for="aclPermission in AclPermission"
            :key="aclPermission"
            :class="[
                'text-center',
                !disabled && isPermissionAvailable(aclEntry.type, aclPermission)
                    ? 'cursor-pointer'
                    : '',
                {
                    'bg-yellow-200': hasChangedPermission(aclEntry, aclPermission, originalGroup),
                },
            ]"
            @click="
                () => {
                    if (!disabled && isPermissionAvailable(aclEntry!.type, aclPermission)) {
                        setPermission(aclPermission);
                    }
                }
            "
            data-test="permissionCell"
        >
            <template v-if="aclEntry.permission.some((p) => p == aclPermission)">
                <CheckCircleIcon
                    :class="[
                        'inline h-5 w-5',
                        isPermissionAvailable(aclEntry.type, aclPermission)
                            ? 'text-zinc-500'
                            : 'text-zinc-200',
                    ]"
                />
            </template>
            <template v-else>
                <XCircleIcon
                    :class="[
                        'inline h-5 w-5',
                        isPermissionAvailable(aclEntry.type, aclPermission)
                            ? hasChangedPermission(aclEntry, aclPermission, originalGroup)
                                ? 'text-zinc-400'
                                : 'text-zinc-200'
                            : 'opacity-0',
                    ]"
                />
            </template>
        </td>
    </tr>
</template>
