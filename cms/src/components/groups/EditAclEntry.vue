<script setup lang="ts">
import { type GroupAclEntryDto, AclPermission, type GroupDto } from "luminary-shared";
import { toRaw, computed, ref } from "vue";
import { capitaliseFirstLetter } from "@/util/string";
import { isPermissionAvailable, validateAclEntry } from "./permissions";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import _ from "lodash";
import { isMobileScreen } from "@/globalConfig";
import { PencilSquareIcon } from "@heroicons/vue/24/outline";
import LDropdown from "@/components/common/LDropdown.vue";
type Props = {
    /**
     * Original data from database for visual marking of changes
     */
    originalGroup: GroupDto;
    disabled: boolean;
};
defineProps<Props>();
const aclEntry = defineModel<GroupAclEntryDto>("aclEntry");

const showSelector = ref(false);

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
    <div v-if="aclEntry" class="contents">
        <div
            class="flex h-full items-center border-b border-zinc-200 pr-2 font-medium"
            :class="isMobileScreen ? 'text-[13px]' : 'text-sm'"
        >
            {{ capitaliseFirstLetter(aclEntry.type) }}
        </div>
        <div class="min-w-0 border-x border-b border-zinc-200 px-1 py-1.5">
            <div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                <div
                    v-for="aclPermission in activePermissions"
                    :key="aclPermission"
                    class="flex-shrink-0 rounded-md bg-zinc-200 px-1 py-0.5 text-xs"
                    data-test="active-permissions"
                >
                    {{ capitaliseFirstLetter(aclPermission) }}
                </div>
            </div>
        </div>
        <div class="flex h-full items-center border-b border-zinc-200 pl-1">
            <LDropdown
                class="relative"
                padding="none"
                v-model:show="showSelector"
                placement="top-end"
                width="auto"
            >
                <template #trigger>
                    <button class="text-zinc-700">
                        <PencilSquareIcon class="h-4 w-4" />
                    </button>
                </template>
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
                    class="flex items-center gap-1 rounded-md border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors"
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
                    <div v-else class="h-2.5 w-2.5 rounded-md border border-zinc-400"></div>
                    {{ capitaliseFirstLetter(aclPermission) }}
                </button>
            </LDropdown>
        </div>
    </div>
</template>
