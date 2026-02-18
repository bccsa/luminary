<script setup lang="ts">
import { defineProps, defineModel, toRaw } from "vue";
import EditAclEntry from "./EditAclEntry.vue";
import DuplicateGroupAclButton from "./DuplicateGroupAclButton.vue";
import { type GroupDto, AclPermission } from "luminary-shared";
import { capitaliseFirstLetter } from "@/util/string";
import { validDocTypes } from "./permissions";
import _ from "lodash";

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
                        v-for="aclEntry in group?.acl
                            .filter(
                                (g) =>
                                    g.groupId == assignedGroup._id &&
                                    validDocTypes.includes(g.type),
                            )
                            .sort((a, b) => {
                                if (a.type < b.type) return -1;
                                if (a.type > b.type) return 1;
                                return 0;
                            })"
                        :aclEntry="aclEntry"
                        :key="aclEntry.type"
                        :originalGroup="originalGroup"
                        :disabled="disabled"
                    />
                </tbody>
            </table>
        </div>
    </div>
</template>
