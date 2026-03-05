<script setup lang="ts">
import { type GroupAclEntryDto, AclPermission, type GroupDto } from "luminary-shared";
import { toRaw } from "vue";
import { capitaliseFirstLetter } from "@/util/string";
import { isPermissionAvailable, hasChangedPermission, validateAclEntry } from "./permissions";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import _ from "lodash";
import { isMobileScreen } from "@/globalConfig";

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
    <tr v-if="aclEntry && !isMobileScreen" class="border-b border-zinc-200 last:border-none">
        <th
            scope="row"
            :class="['py-3 pl-6 pr-10 text-left font-medium', { 'text-zinc-400': disabled }]"
        >
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
                            ? disabled
                                ? 'text-zinc-300'
                                : 'text-zinc-500'
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
                                : disabled
                                  ? 'text-zinc-100'
                                  : 'text-zinc-200'
                            : 'opacity-0',
                    ]"
                />
            </template>
        </td>
    </tr>

    <table
        v-else-if="aclEntry"
        class="flex w-full border-collapse border border-zinc-200 bg-white shadow-sm"
    >
        <tbody>
            <tr>
                <th scope="row" class="py-2 pl-6 pr-10 text-left font-medium">
                    {{ capitaliseFirstLetter(aclEntry.type) }}
                </th>
                <td class="flex items-center gap-2 overflow-scroll p-2 scrollbar-hide">
                    <div v-for="aclPermission in AclPermission" :key="aclPermission">
                        {{ capitaliseFirstLetter(aclPermission) }}
                    </div>
                </td>
            </tr>
        </tbody>
    </table>

    <!-- <div v-else-if="aclEntry" class="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <div class="mb-3 font-medium text-zinc-900">
            {{ capitaliseFirstLetter(aclEntry.type) }}
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
                v-for="aclPermission in AclPermission"
                :key="aclPermission"
                v-show="isPermissionAvailable(aclEntry.type, aclPermission)"
                @click="
                    () => {
                        if (!disabled) setPermission(aclPermission);
                    }
                "
                :disabled="disabled"
                class="flex items-center gap-1 rounded-md border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors"
            >
                <CheckCircleIcon
                    v-if="aclEntry.permission.includes(aclPermission)"
                    :class="[
                        'inline h-3 w-3',
                        isPermissionAvailable(aclEntry.type, aclPermission)
                            ? disabled
                                ? 'text-zinc-300'
                                : 'text-zinc-500'
                            : 'text-zinc-200',
                    ]"
                />
                <div v-else class="h-3 w-3 rounded-md border border-zinc-400"></div>
                {{ capitaliseFirstLetter(aclPermission) }}
            </button>
        </div>
    </div> -->
</template>
