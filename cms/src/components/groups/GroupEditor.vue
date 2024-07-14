<script setup lang="ts">
import { computed, nextTick, ref, toRaw, type Ref } from "vue";
// import { useGroupStore } from "@/stores/group";
import {
    AclPermission,
    db,
    DocType,
    isConnected,
    type GroupAclEntryDto,
    type GroupDto,
} from "luminary-shared";
import { capitaliseFirstLetter } from "@/util/string";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/vue";
import {
    CheckCircleIcon,
    XCircleIcon,
    DocumentDuplicateIcon,
    ChevronUpIcon,
    RectangleStackIcon,
} from "@heroicons/vue/20/solid";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import LButton from "@/components/button/LButton.vue";
import { useNotificationStore } from "@/stores/notification";
// import { useSocketConnectionStore } from "@/stores/socketConnection";
// import { storeToRefs } from "pinia";
import LBadge from "@/components/common/LBadge.vue";
// import { useLocalChangeStore } from "@/stores/localChanges";
import AddGroupAclButton from "./AddGroupAclButton.vue";
import LInput from "../forms/LInput.vue";
import DuplicateGroupAclButton from "./DuplicateGroupAclButton.vue";
import * as _ from "lodash";

const availablePermissionsPerDocType = {
    [DocType.Group]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
    ],
    [DocType.Language]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
    ],
    [DocType.Post]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.Tag]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.User]: [AclPermission.View, AclPermission.Edit, AclPermission.Delete],
};

type Props = {
    group: GroupDto;
};
const props = defineProps<Props>();

// const groupStore = useGroupStore();
// const { group: getGroup, createGroup, updateGroup } = groupStore;
// const { groups } = storeToRefs(groupStore);
const { addNotification } = useNotificationStore();
// const { isConnected } = storeToRefs(useSocketConnectionStore());
// const { isLocalChange } = useLocalChangeStore();

const isDirty = ref(false);
const isEditingGroupName = ref(false);
const isLocalChange = db.isLocalChangeAsRef(props.group._id);
const newGroupName = ref(props.group.name);
const groupNameInput = ref<HTMLInputElement>();
const changedAclEntries: Ref<GroupAclEntryDto[]> = ref([]);
const addedGroups: Ref<GroupDto[]> = ref([]);

const groups = db.whereTypeAsRef<GroupDto[]>(DocType.Group, []);

const uniqueGroups = db.toRef<GroupDto[]>(
    () =>
        db.docs
            .where("type")
            .equals(DocType.Group)
            .and((group) => props.group.acl.some((acl) => acl.groupId == group._id))
            .toArray() as unknown as Promise<GroupDto[]>,
    [],
);

const selectedGroups = computed(() => {
    return uniqueGroups.value.concat(addedGroups.value);
});

// const uniqueGroups = computed(() => {
//     const groups: string[] = [];

//     props.group.acl.forEach((acl) => {
//         if (!groups.includes(acl.groupId)) {
//             groups.push(acl.groupId);
//         }
//     });

//     const mappedGroups = groups.map((groupId) => db.get(groupId)).filter((g) => g) as GroupDto[];

//     return mappedGroups.concat(addedGroups.value);
// });
const availableGroups = computed(() => {
    // if (!groups.value) {
    //     return [];
    // }

    const selectedGroupIds = selectedGroups.value.filter((g) => g).map((g) => g?._id);

    return groups.value.filter(
        (g) => g._id != props.group._id && !selectedGroupIds.includes(g._id),
    );
});

const addGroup = (group: GroupDto) => {
    console.log("test");
    addedGroups.value.push(group);
};

const changePermission = (
    aclGroup: GroupDto,
    docType: DocType,
    aclPermission: AclPermission,
    ignoreViewPermissionCheck = false,
) => {
    if (!isPermissionAvailable.value(docType, aclPermission)) {
        return;
    }

    isDirty.value = true;

    const existingAclEntry = changedAclEntries.value.find(
        (a) => a.groupId == aclGroup._id && a.type == docType,
    );

    // Update the existing entry if it exists
    if (existingAclEntry) {
        const existingAclEntryIndex = changedAclEntries.value.indexOf(existingAclEntry);
        const alreadyChangedPermissionIndex = existingAclEntry.permission.indexOf(aclPermission);

        if (alreadyChangedPermissionIndex > -1 && existingAclEntry.permission.length == 1) {
            // Remove the entry if the only changed permission was changed back to the original value,
            // OR the view permission was removed
            changedAclEntries.value.splice(existingAclEntryIndex, 1);

            // Reset dirty state if there are no changes now
            if (changedAclEntries.value.length == 0 && !hasChangedGroupName.value) {
                isDirty.value = false;
            }
        } else if (alreadyChangedPermissionIndex > -1) {
            // Remove this permission from the list of changed permissions for this entry
            let newPermissionsForGroup = existingAclEntry.permission;
            newPermissionsForGroup.splice(alreadyChangedPermissionIndex, 1);

            changedAclEntries.value[existingAclEntryIndex].permission = newPermissionsForGroup;
        } else {
            // Add the newly changed permission to the existing entry in the changes array
            changedAclEntries.value[existingAclEntryIndex].permission.push(aclPermission);
        }
    } else {
        // No existing entry, push a new item to the changes array
        changedAclEntries.value.push({
            groupId: aclGroup._id,
            type: docType,
            permission: [aclPermission],
        });
    }

    if (
        ignoreViewPermissionCheck ||
        hasAssignedPermission.value(aclGroup, docType, AclPermission.View)
    ) {
        // End here if we're ignoring the view permission, or if the view permission is selected
        return;
    }

    // View permission is required for any other permission to be selected
    if (aclPermission == AclPermission.View) {
        // View was deselected, make sure no other permissions are selected
        for (const [, permission] of Object.entries(AclPermission)) {
            if (
                permission != AclPermission.View &&
                hasAssignedPermission.value(aclGroup, docType, permission)
            ) {
                changePermission(aclGroup, docType, permission, true);
            }
        }
    } else {
        // View is not selected, select it
        changePermission(aclGroup, docType, AclPermission.View, true);
    }
};

/**
 * Whether the given permission is assigned, either in the current saved DB version
 * or because it has been changed
 */
const hasAssignedPermission = computed(() => {
    return (aclGroup: GroupDto, docType: DocType, aclPermission: AclPermission) => {
        const permissionForDocType = props.group.acl.find((acl) => {
            return acl.groupId == aclGroup._id && acl.type == docType;
        });

        const isCurrentlyAssigned = permissionForDocType?.permission.includes(aclPermission);

        const hasChanged = hasChangedPermission.value(aclGroup, docType, aclPermission);

        if (!hasChanged) {
            return isCurrentlyAssigned;
        }

        if (isCurrentlyAssigned) {
            return false;
        }

        return true;
    };
});

/**
 * Whether the given permission has been changed by the user, but not yet saved to the DB
 */
const hasChangedPermission = computed(() => {
    return (aclGroup: GroupDto, docType: DocType, aclPermission: AclPermission) => {
        const permissionForDocType = changedAclEntries.value.find((acl) => {
            return acl.groupId == aclGroup._id && acl.type == docType;
        });

        if (!permissionForDocType) {
            return false;
        }

        return permissionForDocType.permission.includes(aclPermission);
    };
});

/**
 * Check if the permission is available to be changed by the user
 */
const isPermissionAvailable = computed(() => {
    return (docType: DocType, aclPermission: AclPermission) => {
        // @ts-expect-error Not all DocTypes are in the array but we only call it with ones that are
        return availablePermissionsPerDocType[docType].includes(aclPermission);
    };
});

const hasChangedGroupName = computed(() => newGroupName.value != props.group.name);

const startEditingGroupName = (e: Event, open: boolean) => {
    if (!open) return;

    e.preventDefault();

    isEditingGroupName.value = true;
    nextTick(() => {
        groupNameInput.value?.focus();
    });
};

const finishEditingGroupName = () => {
    isEditingGroupName.value = false;

    if (hasChangedGroupName.value) {
        isDirty.value = true;
    } else if (changedAclEntries.value.length == 0) {
        isDirty.value = false;
    }
};

const discardChanges = () => {
    changedAclEntries.value = [];
    isDirty.value = false;
    newGroupName.value = props.group.name;
};

const duplicateGroup = async () => {
    const duplicatedGroup = { ...toRaw(props.group), _id: db.uuid() };
    duplicatedGroup.name = `${duplicatedGroup.name} - copy`;

    await db.upsert<GroupDto>(duplicatedGroup);

    addNotification({
        title: `Group "${duplicatedGroup.name}" created successfully`,
        description: "You can now add access lists to this group.",
        state: "success",
    });
};

const duplicateAcl = async (newGroup: GroupDto, existingGroup: GroupDto) => {
    addGroup(newGroup);

    existingGroup.acl.forEach((acl) => {
        acl.permission.forEach((permission) => {
            changePermission(newGroup, acl.type, permission);
        });
    });
    addNotification({
        title: `ACL entry ${newGroup.name} duplicated successfully`,
        description: "You can now edit the permissions for the new ACL entry.",
        state: "success",
    });
};
const copyGroupId = (group: GroupDto) => {
    const groupId = group._id;
    navigator.clipboard.writeText(groupId);

    addNotification({
        title: `Group ID Copied`,
        description: "The ID of the group has been copied to the clipboard",
        state: "success",
    });
};

const saveChanges = async () => {
    const updatedGroup = {
        ...(toRaw(props.group) as unknown as GroupDto),
        name: newGroupName.value,
    };

    // Update existing entries with changed permissions, if there are any
    updatedGroup.acl = updatedGroup.acl.map((currentAcl) => {
        const changedAclEntry = changedAclEntries.value.find(
            (a) => a.groupId == currentAcl.groupId && a.type == currentAcl.type,
        );

        // If the entry wasn't changed, return the current entry
        if (!changedAclEntry) {
            return currentAcl;
        }

        // Otherwise, rebuild the permission map based on the changed permissions
        const newPermissions = [];

        for (const [, permission] of Object.entries(AclPermission)) {
            const originalAclHasPermission = currentAcl.permission.includes(permission);
            const changedHasPermission = changedAclEntry.permission.includes(permission);

            if (
                (originalAclHasPermission && !changedHasPermission) ||
                (!originalAclHasPermission && changedHasPermission)
            ) {
                newPermissions.push(permission);
            }
        }

        return {
            ...currentAcl,
            permission: newPermissions,
        } as GroupAclEntryDto;
    });

    // Add any entries to the group that were not present before
    toRaw(changedAclEntries.value).forEach((changedAclEntry) => {
        const entryIsInGroup = updatedGroup.acl.find(
            (a) => a.groupId == changedAclEntry.groupId && a.type == changedAclEntry.type,
        );

        if (!entryIsInGroup) {
            updatedGroup.acl.push(changedAclEntry);
        }
    });

    // Filter out any entries that have no permissions, to prevent clutter in the DB
    updatedGroup.acl = updatedGroup.acl.filter((a) => a.permission.length > 0);

    await db.upsert<GroupDto>(updatedGroup);

    addedGroups.value = [];
    changedAclEntries.value = [];
    isDirty.value = false;

    addNotification({
        title: `${newGroupName.value} changes saved`,
        description: `All changes are saved ${
            isConnected.value
                ? "online"
                : "offline, and will be sent to the server when you go online"
        }.`,
        state: "success",
    });
};
</script>

<template>
    <div class="w-full overflow-visible rounded-md bg-white shadow">
        <Disclosure v-slot="{ open }">
            <DisclosureButton
                :class="[
                    'flex w-full items-center justify-between rounded-md bg-white px-6 py-4',
                    { 'sticky top-16 z-10 mb-4 rounded-b-none border-b border-zinc-200': open },
                ]"
            >
                <div
                    v-if="!isEditingGroupName"
                    :class="[
                        '-mx-2 flex items-center gap-2 rounded px-2 py-1',
                        {
                            'bg-yellow-200 hover:bg-yellow-300 active:bg-yellow-400':
                                hasChangedGroupName && open,
                        },
                        { 'hover:bg-zinc-100 active:bg-zinc-200': !hasChangedGroupName && open },
                    ]"
                    @click="(e) => startEditingGroupName(e, open)"
                    :title="open ? 'Edit group name' : ''"
                    data-test="groupName"
                >
                    <RectangleStackIcon class="h-5 w-5 text-zinc-400" />
                    <h2 class="font-medium text-zinc-800">{{ newGroupName }}</h2>
                </div>
                <LInput
                    v-else
                    size="sm"
                    ref="groupNameInput"
                    name="groupName"
                    v-model="newGroupName"
                    @blur="finishEditingGroupName"
                    @keyup.enter="finishEditingGroupName"
                    @keydown.enter.stop
                    @keydown.space.stop
                    @click.stop
                    class="mr-4 grow"
                    data-test="groupNameInput"
                />
                <div class="flex items-center gap-4">
                    <div v-if="isDirty && open" class="-my-2 flex items-center gap-2">
                        <LButton
                            variant="tertiary"
                            size="sm"
                            context="danger"
                            @click.prevent="discardChanges"
                            data-test="discardChanges"
                        >
                            Discard changes
                        </LButton>
                        <LButton size="sm" @click.prevent="saveChanges" data-test="saveChanges">
                            Save changes
                        </LButton>
                    </div>

                    <LBadge v-if="isDirty && !open">Unsaved changes</LBadge>
                    <LBadge v-if="isLocalChange && !isConnected" variant="warning">
                        Offline changes
                    </LBadge>
                    <LButton
                        v-if="groups && groups.length > 0 && open && !isDirty"
                        variant="muted"
                        size="sm"
                        title="Duplicate"
                        :icon="DocumentDuplicateIcon"
                        @click="duplicateGroup"
                        data-test="duplicateGroup"
                    />
                    <ChevronUpIcon :class="{ 'rotate-180 transform': !open }" class="h-5 w-5" />
                </div>
            </DisclosureButton>
            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-out"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <DisclosurePanel class="space-y-6 px-6 pb-10 pt-2">
                    <TransitionGroup
                        enter-active-class="transition ease duration-500"
                        enter-from-class="opacity-0 scale-90"
                        enter-to-class="opacity-100 scale-100"
                    >
                        <div
                            v-for="aclGroup in selectedGroups"
                            :key="aclGroup?._id"
                            class="overflow-x-auto"
                        >
                            <div
                                class="inline-block rounded-md border border-zinc-200 bg-zinc-50 shadow-sm"
                            >
                                <h3
                                    class="border-b border-zinc-200 px-6 py-4 text-center font-medium text-zinc-700"
                                >
                                    <!-- Add the duplicate button of ACL  -->
                                    <div class="flex items-center justify-between">
                                        <div></div>
                                        <div class="py-1">
                                            {{ aclGroup?.name }}
                                        </div>
                                        <div>
                                            <DuplicateGroupAclButton
                                                :groups="availableGroups"
                                                @select="
                                                    (group: GroupDto) =>
                                                        duplicateAcl(group, aclGroup)
                                                "
                                                data-test="duplicateAcl"
                                            />
                                        </div>
                                    </div>
                                </h3>

                                <table>
                                    <thead
                                        class="border-b border-zinc-200 bg-zinc-100 last:border-none"
                                    >
                                        <tr>
                                            <th></th>
                                            <th
                                                v-for="aclPermission in AclPermission"
                                                :key="aclPermission"
                                                class="p-4 text-center text-sm font-medium uppercase tracking-wider text-zinc-600 last:pr-6 lg:min-w-24"
                                            >
                                                {{ capitaliseFirstLetter(aclPermission) }}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr
                                            v-for="docType in Object.keys(
                                                availablePermissionsPerDocType,
                                            )"
                                            :key="docType"
                                            class="border-b border-zinc-200 last:border-none"
                                        >
                                            <th
                                                scope="row"
                                                class="py-3 pl-6 pr-10 text-left font-medium"
                                            >
                                                {{ capitaliseFirstLetter(docType) }}
                                            </th>
                                            <td
                                                v-for="aclPermission in AclPermission"
                                                :key="aclPermission"
                                                :class="[
                                                    'text-center',
                                                    isPermissionAvailable(
                                                        docType as DocType,
                                                        aclPermission,
                                                    )
                                                        ? 'cursor-pointer'
                                                        : 'cursor-not-allowed',
                                                    {
                                                        'bg-yellow-200': hasChangedPermission(
                                                            aclGroup,
                                                            docType as DocType,
                                                            aclPermission,
                                                        ),
                                                    },
                                                ]"
                                                @click="
                                                    changePermission(
                                                        aclGroup,
                                                        docType as DocType,
                                                        aclPermission,
                                                    )
                                                "
                                                data-test="permissionCell"
                                            >
                                                <template
                                                    v-if="
                                                        hasAssignedPermission(
                                                            aclGroup,
                                                            docType as DocType,
                                                            aclPermission,
                                                        )
                                                    "
                                                >
                                                    <CheckCircleIcon
                                                        :class="[
                                                            'inline h-5 w-5',
                                                            isPermissionAvailable(
                                                                docType as DocType,
                                                                aclPermission,
                                                            )
                                                                ? 'text-zinc-500'
                                                                : 'text-zinc-200',
                                                        ]"
                                                    />
                                                </template>
                                                <template v-else>
                                                    <XCircleIcon
                                                        :class="[
                                                            'inline h-5 w-5',
                                                            isPermissionAvailable(
                                                                docType as DocType,
                                                                aclPermission,
                                                            )
                                                                ? hasChangedPermission(
                                                                      aclGroup,
                                                                      docType as DocType,
                                                                      aclPermission,
                                                                  )
                                                                    ? 'text-zinc-400'
                                                                    : 'text-zinc-300'
                                                                : 'text-zinc-200',
                                                        ]"
                                                    />
                                                </template>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </TransitionGroup>

                    <div class="flex items-center justify-between">
                        <div>
                            <AddGroupAclButton :groups="availableGroups" @select="addGroup" />
                        </div>
                        <LButton
                            variant="tertiary"
                            size="sm"
                            context="default"
                            @click.prevent="() => copyGroupId(group)"
                            data-test="copyGroupId"
                        >
                            Copy ID
                        </LButton>
                    </div>
                </DisclosurePanel>
            </transition>
        </Disclosure>

        <ConfirmBeforeLeavingModal :isDirty="isDirty" />
    </div>
</template>
