<script setup lang="ts">
import { computed, ref, toRaw, type Ref } from "vue";
import { useGroupStore } from "@/stores/group";
import {
    AclPermission,
    DocType,
    type Group,
    type GroupAclEntry,
    type GroupAclEntryDto,
    type GroupDto,
    type Uuid,
} from "@/types";
import { capitaliseFirstLetter } from "@/util/string";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/vue";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import { ChevronUpIcon, RectangleStackIcon } from "@heroicons/vue/20/solid";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import LButton from "@/components/button/LButton.vue";
import { useNotificationStore } from "@/stores/notification";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { storeToRefs } from "pinia";
import LBadge from "../common/LBadge.vue";
import { useLocalChangeStore } from "@/stores/localChanges";

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
    group: Group;
};
const props = defineProps<Props>();

const { group: getGroup, updateGroup } = useGroupStore();
const { addNotification } = useNotificationStore();
const { isConnected } = storeToRefs(useSocketConnectionStore());
const { isLocalChange } = useLocalChangeStore();

const isDirty = ref(false);
const changedAclEntries: Ref<GroupAclEntry[]> = ref([]);

const uniqueGroups = computed(() => {
    const groups: string[] = [];

    props.group.acl.forEach((acl) => {
        if (!groups.includes(acl.groupId)) {
            groups.push(acl.groupId);
        }
    });

    return groups.map((groupId) => getGroup(groupId));
});

const changePermission = (
    aclGroup: Group,
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
            if (changedAclEntries.value.length == 0) {
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
        for (const [_, permission] of Object.entries(AclPermission)) {
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
    return (aclGroup: Group, docType: DocType, aclPermission: AclPermission) => {
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
    return (aclGroup: Group, docType: DocType, aclPermission: AclPermission) => {
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

const discardChanges = () => {
    changedAclEntries.value = [];
    isDirty.value = false;
};

const saveChanges = async () => {
    const updatedGroup = { ...(toRaw(props.group) as unknown as GroupDto) };

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

        for (const [_, permission] of Object.entries(AclPermission)) {
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

    await updateGroup(updatedGroup);

    changedAclEntries.value = [];
    isDirty.value = false;

    addNotification({
        title: `${props.group.name} changes saved`,
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
    <div class="w-full rounded-lg bg-white shadow">
        <Disclosure v-slot="{ open }">
            <DisclosureButton
                :class="[
                    'flex w-full justify-between rounded-lg bg-white px-6 py-4',
                    { 'sticky top-16': open },
                ]"
            >
                <div class="flex items-center gap-2">
                    <RectangleStackIcon class="h-5 w-5 text-zinc-400" />
                    <h2 class="font-medium text-zinc-800">{{ group.name }}</h2>
                </div>
                <div class="flex items-center gap-4">
                    <div v-if="isDirty && open" class="-my-2 flex items-center gap-2">
                        <LButton
                            variant="tertiary"
                            size="sm"
                            context="danger"
                            @click.prevent="discardChanges"
                        >
                            Discard changes
                        </LButton>
                        <LButton size="sm" @click.prevent="saveChanges"> Save changes </LButton>
                    </div>

                    <LBadge v-if="isDirty && !open">Unsaved changes</LBadge>
                    <LBadge v-if="isLocalChange(group._id) && !isConnected" variant="warning">
                        Offline changes
                    </LBadge>

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
                <DisclosurePanel
                    class="space-y-6 overflow-x-scroll px-6 pb-10 pt-2 lg:overflow-hidden"
                >
                    <div
                        v-for="subGroup in uniqueGroups"
                        :key="subGroup?._id"
                        class="inline-block rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm"
                    >
                        <h3
                            class="border-b border-zinc-200 px-6 py-4 text-center font-medium text-zinc-700"
                        >
                            {{ subGroup?.name }}
                        </h3>

                        <table>
                            <thead class="border-b border-zinc-200 bg-zinc-100 last:border-none">
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
                                    v-for="docType in Object.keys(availablePermissionsPerDocType)"
                                    :key="docType"
                                    class="border-b border-zinc-200 last:border-none"
                                >
                                    <th scope="row" class="py-3 pl-6 pr-10 text-left font-medium">
                                        {{ capitaliseFirstLetter(docType) }}
                                    </th>
                                    <td
                                        v-for="aclPermission in AclPermission"
                                        :key="aclPermission"
                                        :class="[
                                            'text-center',
                                            isPermissionAvailable(docType as DocType, aclPermission)
                                                ? 'cursor-pointer'
                                                : 'cursor-not-allowed',
                                            {
                                                'bg-yellow-200':
                                                    subGroup &&
                                                    hasChangedPermission(
                                                        subGroup,
                                                        docType as DocType,
                                                        aclPermission,
                                                    ),
                                            },
                                        ]"
                                        @click="
                                            subGroup
                                                ? changePermission(
                                                      subGroup,
                                                      docType as DocType,
                                                      aclPermission,
                                                  )
                                                : ''
                                        "
                                    >
                                        <template
                                            v-if="
                                                subGroup &&
                                                hasAssignedPermission(
                                                    subGroup,
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
                                                    subGroup &&
                                                    isPermissionAvailable(
                                                        docType as DocType,
                                                        aclPermission,
                                                    )
                                                        ? hasChangedPermission(
                                                              subGroup,
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
                </DisclosurePanel>
            </transition>
        </Disclosure>

        <ConfirmBeforeLeavingModal :isDirty="isDirty" />
    </div>
</template>
