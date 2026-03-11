<script setup lang="ts">
import { toRaw, computed, ref } from "vue";
import EditAclEntry from "./EditAclEntry.vue";
import DuplicateGroupAclButton from "./DuplicateGroupAclButton.vue";
import { type GroupDto, AclPermission } from "luminary-shared";
import { capitaliseFirstLetter } from "@/util/string";
import { validDocTypes } from "./permissions";
import _ from "lodash";
import { isMobileScreen } from "@/globalConfig";
import DisplayCard from "@/components/common/DisplayCard.vue";
import LModal from "../modals/LModal.vue";
import { PencilSquareIcon } from "@heroicons/vue/24/outline";
import LDropdown from "@/components/common/LDropdown.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";

type Props = {
    /**
     * Assigned group by which this component should filter and display / edit ACL entries
     */
    assignedGroup: GroupDto;
    /**
     * Original data from database for visual marking of changes
     */
    originalGroup: GroupDto;
    /**
     * List of available groups to duplicate ACL entries from
     */
    availableGroups: GroupDto[];
    disabled: boolean;
};
const props = defineProps<Props>();
const group = defineModel<GroupDto>("group");

const duplicateGroup = (targetGroup: GroupDto) => {
    group.value?.acl.push(
        ..._.cloneDeep(toRaw(group.value.acl))
            .filter((a) => a.groupId == props.assignedGroup._id)
            .map((a) => ({
                ...a,
                groupId: targetGroup._id,
            })),
    );
};

const isVisible = ref(false);

const visibleAclEntries = computed(() => {
    return (
        group.value?.acl
            .filter((g) => g.groupId == props.assignedGroup._id && validDocTypes.includes(g.type))
            .sort((a, b) => {
                if (a.type < b.type) return -1;
                if (a.type > b.type) return 1;
                return 0;
            }) || []
    );
});

const showSelector = ref(false);

const typesWithActivePermissions = computed(() => {
    return visibleAclEntries.value
        .filter((aclEntry) => aclEntry.permission.length > 0)
        .map((aclEntry) => aclEntry.type);
});

const activeAclEntries = computed(() => {
    return visibleAclEntries.value.filter((aclEntry) => aclEntry.permission.length > 0);
});

const toggleAclEntry = (aclEntry: any) => {
    if (aclEntry.permission.length > 0) {
        aclEntry.permission = [];
    } else {
        aclEntry.permission.push(AclPermission.View);
    }
};
</script>

<template>
    <div v-if="!isMobileScreen" class="w-full">
        <div class="inline-block w-full rounded-md border border-zinc-200 bg-zinc-50 shadow-sm">
            <h3
                :class="[
                    'border-b border-zinc-200 px-6 py-4 text-center font-medium',
                    { 'text-zinc-700': !disabled },
                    { 'text-zinc-400': disabled },
                ]"
            >
                <!-- Add the duplicate ACL button -->
                <div class="flex items-center justify-between">
                    <div></div>
                    <div class="py-1">
                        {{ assignedGroup.name }}
                    </div>
                    <div>
                        <DuplicateGroupAclButton
                            :groups="availableGroups"
                            @select="duplicateGroup"
                            data-test="duplicateAcl"
                            v-if="!disabled"
                        />
                    </div>
                </div>
            </h3>

            <table class="w-full">
                <thead class="border-b border-zinc-200 bg-zinc-100 last:border-none">
                    <tr>
                        <th></th>
                        <th
                            v-for="aclPermission in AclPermission"
                            :key="aclPermission"
                            :class="[
                                'p-4 text-center text-sm font-medium uppercase tracking-wider last:pr-6 lg:min-w-24',
                                { 'text-zinc-600': !disabled },
                                { 'text-zinc-400': disabled },
                            ]"
                        >
                            {{ capitaliseFirstLetter(aclPermission) }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <!-- :aclEntry is a defineModel in EditAclEntry.
                    Using "v-model:aclEntry" causes the error: "eslint: 'v-model' directives cannot update the iteration variable 'aclEntry' itself." -->
                    <EditAclEntry
                        v-for="aclEntry in visibleAclEntries"
                        :aclEntry="aclEntry"
                        :key="aclEntry.type"
                        :originalGroup="originalGroup"
                        :disabled="disabled"
                    />
                </tbody>
            </table>
        </div>
    </div>
    <DisplayCard
        v-else
        :title="``"
        :updatedTimeUtc="0"
        class="rounded-md border !px-0 !py-0"
        @click="isVisible = true"
    >
        <template #content>
            <div class="flex items-center">
                <div class="flex-shrink-0 whitespace-nowrap px-1 text-xs font-medium">
                    {{ assignedGroup.name }}
                </div>
                <div
                    v-if="typesWithActivePermissions.length > 0"
                    class="flex w-full items-center gap-1 overflow-x-scroll border-x border-zinc-200 px-2 scrollbar-hide"
                >
                    <div
                        v-for="aclEntry in typesWithActivePermissions"
                        :key="aclEntry"
                        class="flex-shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
                    >
                        {{ capitaliseFirstLetter(aclEntry) }}
                    </div>
                </div>
                <div
                    v-else
                    class="my-3 mr-1 w-full overflow-x-scroll whitespace-nowrap border-x border-zinc-200 px-2 text-xs text-zinc-600 scrollbar-hide"
                >
                    No active permissions, click to add!
                </div>
                <div v-if="typesWithActivePermissions.length > 0">
                    <DuplicateGroupAclButton
                        :groups="availableGroups"
                        @select="duplicateGroup"
                        data-test="duplicateAcl"
                        v-if="!disabled"
                    />
                </div>
            </div>
        </template>
    </DisplayCard>

    <LModal
        v-model:isVisible="isVisible"
        :heading="`Edit permissions for ${assignedGroup.name}`"
        largeModal
    >
        <div>
            <EditAclEntry
                v-for="aclEntry in activeAclEntries"
                :key="aclEntry.type"
                :originalGroup="originalGroup"
                :aclEntry="aclEntry"
                :disabled="disabled"
            />
        </div>
        <div class="">
            <div v-if="typesWithActivePermissions.length === 0" class="text-xs">
                No active permissions, use the selector to add!
            </div>
            <LDropdown
                class="relative"
                padding="none"
                v-model:show="showSelector"
                placement="top-start"
                width="auto"
            >
                <template #trigger>
                    <button
                        class="mt-1 flex w-16 items-center justify-center rounded-md border border-zinc-400 bg-white text-zinc-700"
                    >
                        <PencilSquareIcon class="h-5 w-5" />
                    </button>
                </template>
                <button
                    v-for="aclEntry in visibleAclEntries"
                    :key="aclEntry.type"
                    @click="toggleAclEntry(aclEntry)"
                    class="flex items-center gap-1 rounded-md border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors"
                >
                    <CheckCircleIcon
                        v-if="typesWithActivePermissions.includes(aclEntry.type)"
                        class="inline h-3 w-3"
                    />
                    <div v-else class="h-3 w-3 rounded-md border border-zinc-400"></div>
                    {{ capitaliseFirstLetter(aclEntry.type) }}
                </button>
            </LDropdown>
        </div>
    </LModal>
</template>
