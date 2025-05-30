<script setup lang="ts">
import { computed } from "vue";
import {
    db,
    DocType,
    type Uuid,
    type GroupDto,
    verifyAccess,
    AclPermission,
} from "luminary-shared";
import LCombobox, { type ComboboxOption } from "../forms/LCombobox.vue";

// Define props: docType (required) and disabled (optional)
type Props = {
    disabled?: boolean;
    docType: DocType;
};
const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

// Bind the model for selected groups using Vue's defineModel
const groups = defineModel<Uuid[]>("groups", { required: true });

// Reactive list of all available groups from the database
const availableGroups = db.whereTypeAsRef<GroupDto[]>(DocType.Group, []);

// Compute assignable groups based on access control:
// - Must have EDIT access to the document type
// - Must have ASSIGN access to the group
const assignableGroups = computed(() =>
    availableGroups.value?.filter(
        (g) =>
            verifyAccess([g._id], props.docType, AclPermission.Edit, "any") &&
            verifyAccess([g._id], DocType.Group, AclPermission.Assign, "any"),
    ),
);

// Map assignable groups to the ComboboxOption format for dropdown display
const groupList = computed<ComboboxOption[]>(() =>
    assignableGroups.value.map((group) => ({
        id: group._id,
        label: group.name,
        value: group._id,
    })),
);

// Compute the selected groups list with extra metadata:
// - If the group is viewable: show the label
// - If not viewable: fallback to UUID as label
// - Disable remove if group is not assignable
const selectedGroupOptions = computed<ComboboxOption[]>(() =>
    groups.value.map((groupId) => {
        const group = availableGroups.value?.find((g) => g._id === groupId);

        if (group && verifyAccess([group._id], DocType.Group, AclPermission.View, "any")) {
            const canAssign =
                verifyAccess([group._id], DocType.Group, AclPermission.Assign, "any") &&
                verifyAccess([group._id], props.docType, AclPermission.Edit, "any");

            return {
                id: group._id,
                label: group.name,
                value: group._id,
                isVisible: true,
                isRemovable: canAssign,
            };
        }

        // Fallback for non-viewable groups: display ID, non-removable
        return {
            id: groupId,
            label: groupId,
            value: groupId,
            isVisible: false,
            isRemovable: false,
        };
    }),
);
</script>

<template>
    <div>
        <!-- Group selection component using LCombobox -->
        <LCombobox
            :disabled="disabled"
            :options="groupList"
            label="Group Membership"
            :selectedOptions="groups"
            :selectedLabels="selectedGroupOptions"
            :showSelectedInDropdown="false"
        />

        <!-- Transition with fade/scale animation when no group is selected -->
        <Transition
            enter-active-class="transition duration-75 delay-100"
            enter-from-class="transform scale-90 opacity-0 absolute"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75"
            leave-from-class="transform scale-100 opacity-100 absolute"
            leave-to-class="transform scale-90 opacity-0"
        >
            <div v-if="selectedGroupOptions.length === 0" class="text-xs text-zinc-500">
                No group selected
            </div>
        </Transition>
    </div>
</template>
