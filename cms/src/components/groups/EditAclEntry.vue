<script setup lang="ts">
import { type GroupAclEntryDto, AclPermission, type GroupDto } from "luminary-shared";
import { toRaw, computed } from "vue";
import { capitaliseFirstLetter } from "@/util/string";
import { isPermissionAvailable, hasChangedPermission, validateAclEntry } from "./permissions";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import _ from "lodash";
import { isMobileScreen } from "@/globalConfig";
import { PencilSquareIcon } from "@heroicons/vue/24/outline";

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

const activePermissions = computed(() => {
    if (!aclEntry.value) return [];
    return Object.values(AclPermission).filter(
        (p) =>
            isPermissionAvailable.value(aclEntry.value!.type, p) &&
            aclEntry.value!.permission.includes(p),
    );
});
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

    <div
        v-else-if="aclEntry"
        class="flex w-full items-start border-b border-zinc-200 bg-white last:border-none"
    >
        <div class="whitespace-nowrap py-3 pl-6 pr-4 font-medium">
            {{ capitaliseFirstLetter(aclEntry.type) }}
        </div>
        <div class="min-w-0 flex-1 p-3">
            <div class="flex items-start gap-4 overflow-x-auto scrollbar-hide">
                <div
                    v-for="aclPermission in activePermissions"
                    :key="aclPermission"
                    class="flex flex-shrink-0 flex-col items-center gap-1 p-1"
                >
                    <span class="text-xs uppercase">{{ aclPermission }}</span>
                </div>
            </div>
        </div>
        <div class="flex items-center py-3">
            <button class="text-zinc-700">
                <PencilSquareIcon class="h-5 w-5" />
            </button>
        </div>
    </div>
</template>
