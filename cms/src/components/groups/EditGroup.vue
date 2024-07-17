<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from "vue";
import { db, DocType, isConnected, type GroupDto } from "luminary-shared";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/vue";
import { DocumentDuplicateIcon, ChevronUpIcon, RectangleStackIcon } from "@heroicons/vue/20/solid";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import LButton from "@/components/button/LButton.vue";
import EditAclByGroup from "./EditAclByGroup.vue";
import { useNotificationStore } from "@/stores/notification";
import LBadge from "@/components/common/LBadge.vue";
import AddGroupAclButton from "./AddGroupAclButton.vue";
import LInput from "../forms/LInput.vue";
import * as _ from "lodash";
import { validDocTypes } from "./permissions";

const { addNotification } = useNotificationStore();

type Props = {
    group: GroupDto;
};
const props = defineProps<Props>();

const groups = db.whereTypeAsRef<GroupDto[]>(DocType.Group, []);
const editable = ref<GroupDto>(props.group);
const editable_cleaned = ref<GroupDto>(props.group);
const original_cleaned = ref<GroupDto>(props.group);

// Clear ACL's with no permissions from "editable" and save to "editable_cleaned"
watch(
    editable,
    (current) => {
        editable_cleaned.value = {
            ...current,
            acl: toRaw(current.acl).filter((a) => a.permission.length > 0),
        };
    },
    { deep: true },
);

// Clear ACL's with no permissions from the passed group and save to "original_cleaned"
watch(
    props.group,
    (current) => {
        original_cleaned.value = {
            ...current,
            acl: toRaw(current.acl).filter((a) => a.permission.length > 0),
        };
    },
    { deep: true },
);

const isEditingGroupName = ref(false);
const isLocalChange = db.isLocalChangeAsRef(props.group._id);
const groupNameInput = ref<HTMLInputElement>();

const assignedGroups = computed(() => {
    return groups.value
        .filter((g) => editable.value.acl.some((acl) => acl.groupId == g._id))
        .sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });
});

// Add empty aclEntries to "editable" per assigned group for a complete visual overview
watch(assignedGroups, (newAssignedGroups, oldAssignedGroups) => {
    // get newly assigned groups
    let newGroups = newAssignedGroups;
    if (oldAssignedGroups) {
        newGroups = newAssignedGroups.filter((g) => !oldAssignedGroups.some((o) => o._id == g._id));
    }

    // Add missing ACL entries
    newGroups.forEach((assignedGroup) => {
        validDocTypes.forEach((docType) => {
            const aclEntry = editable.value.acl.find(
                (acl) => acl.groupId == assignedGroup._id && acl.type == docType,
            );
            if (!aclEntry) {
                editable.value.acl.push({
                    groupId: assignedGroup._id,
                    type: docType,
                    permission: [],
                });
            }
        });
    });
});

const availableGroups = computed(() => {
    return groups.value.filter((g) => !editable.value.acl.some((acl) => acl.groupId == g._id));
});

const isDirty = computed(() => {
    return !_.isEqual(
        { ...toRaw(original_cleaned.value), updatedTimeUtc: 0, _rev: "" },
        { ...toRaw(editable_cleaned.value), updatedTimeUtc: 0, _rev: "" },
    );
});

const hasChangedGroupName = computed(() => editable.value.name != props.group.name);

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
};

const discardChanges = () => {
    editable.value.name = props.group.name;
    editable.value.acl.forEach((acl) => {
        acl.permission = _.cloneDeep(
            props.group.acl.find((a) => a.groupId == acl.groupId && a.type == acl.type)
                ?.permission || [],
        );
    });
};

const addAssignedGroup = (selectedGroup: GroupDto) => {
    editable.value.acl.push(
        ...validDocTypes.map((docType) => ({
            groupId: selectedGroup._id,
            type: docType,
            permission: [],
        })),
    );
};

const duplicateGroup = async () => {
    const duplicatedGroup = { ...toRaw(props.group), _id: db.uuid() };
    duplicatedGroup.name = `${duplicatedGroup.name} - copy`;
    await db.upsert<GroupDto>(duplicatedGroup);
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
    db.upsert<GroupDto>(toRaw(editable_cleaned.value));

    addNotification({
        title: `${editable_cleaned.value.name} changes saved`,
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
                    <h2 class="font-medium text-zinc-800">{{ editable.name }}</h2>
                </div>
                <LInput
                    v-else
                    size="sm"
                    ref="groupNameInput"
                    name="groupName"
                    v-model="editable.name"
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
                        <EditAclByGroup
                            v-for="assignedGroup in assignedGroups"
                            :key="assignedGroup._id"
                            :group="editable"
                            :assignedGroup="assignedGroup"
                            :originalGroup="group"
                            :availableGroups="availableGroups"
                        />
                    </TransitionGroup>

                    <div class="flex items-center justify-between">
                        <div>
                            <AddGroupAclButton
                                :groups="availableGroups"
                                @select="addAssignedGroup"
                            />
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
