<script setup lang="ts">
import { computed, ref } from "vue";

import {
    db,
    DocType,
    type Uuid,
    type GroupDto,
    verifyAccess,
    AclPermission,
} from "luminary-shared";
import LCombobox, { type ComboboxOption } from "../forms/LCombobox.vue";

type Props = {
    disabled?: boolean;
    docType: DocType;
};
const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});
const groups = defineModel<Uuid[]>("groups");

const availableGroups = db.whereTypeAsRef<GroupDto[]>(DocType.Group, []);

// To be able to assign a group, a user needs to have assign permissions (to be able to assign the group to a document), and also have edit access to the specific document type.
const assignableGroups = computed(() =>
    availableGroups.value?.filter(
        (g) =>
            verifyAccess([g._id], props.docType, AclPermission.Edit, "any") &&
            verifyAccess([g._id], DocType.Group, AclPermission.Assign, "any"),
    ),
);

const selectedGroups = computed(
    () => availableGroups.value?.filter((g) => groups.value?.includes(g._id)) || [],
);

const groupList = computed(() => {
    const newGroups: ComboboxOption[] = [];
    filteredGroups.value.forEach((group) => {
        const newGroup: ComboboxOption = {
            id: group._id,
            label: group.name,
            value: group._id,
        };
        newGroups.push(newGroup);
    });
    return newGroups;
});

const query = ref("");
const filteredGroups = computed(() =>
    query.value === ""
        ? assignableGroups.value
        : assignableGroups.value.filter((group) => {
              return group.name.toLowerCase().includes(query.value.toLowerCase());
          }),
);
</script>

<template>
    <div>
        <LCombobox
            :disabled="disabled"
            :options="groupList"
            label="Group Membership"
            :selectedOptions="groups"
            :showSelectedInDropdown="false"
        />

        <Transition
            enter-active-class="transition duration-75 delay-100"
            enter-from-class="transform scale-90 opacity-0 absolute"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75"
            leave-from-class="transform scale-100 opacity-100 absolute"
            leave-to-class="transform scale-90 opacity-0"
        >
            <div v-if="selectedGroups?.length == 0" class="text-xs text-zinc-500">
                No group selected
            </div>
        </Transition>
    </div>
</template>
