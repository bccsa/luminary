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
</script>

<template>
    <div class="w-full">
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

            <table v-if="!isMobileScreen" class="w-full">
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
            <!-- <div v-else class="grid grid-cols-2 gap-2 p-4">
                <EditAclEntry
                    v-for="aclEntry in visibleAclEntries"
                    :aclEntry="aclEntry"
                    :key="aclEntry.type"
                    :originalGroup="originalGroup"
                    :disabled="disabled"
                />
                <div v-if="visibleAclEntries.length === 0" class="py-6 text-center text-zinc-500">
                    No permissions defined for this group
                </div>
            </div> -->
            <DisplayCard
                v-else
                :title="``"
                :updatedTimeUtc="0"
                class="mt-4 rounded-md border py-2"
                @click="isVisible = true"
            >
                <template #content>
                    <div class="flex items-center">
                        <span class="whitespace-nowrap">{{ assignedGroup.name }}&nbsp;:</span>
                        <div
                            class="ml-2 flex w-full justify-between overflow-x-scroll rounded-md border border-zinc-400 border-x-zinc-500 py-2 pr-2 scrollbar-hide"
                        >
                            <div
                                v-for="aclEntry in visibleAclEntries"
                                :key="aclEntry.type"
                                class="ml-2 flex items-center gap-1 rounded-md border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors"
                            >
                                {{ capitaliseFirstLetter(aclEntry.type) }}
                            </div>
                        </div>
                    </div>
                </template>
            </DisplayCard>
        </div>
    </div>

    <LModal v-model:isVisible="isVisible" :heading="`Edit permissions for ${assignedGroup.name}`">
        <table>
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
    </LModal>
</template>
