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

const assignableGroups = computed(() =>
    availableGroups.value?.filter((g) =>
        verifyAccess([g._id], props.docType, AclPermission.Edit, "any"),
    ),
);

const selectedGroups = computed(
    () => availableGroups.value?.filter((g) => groups.value?.includes(g._id)) || [],
);

const formattedGroups = computed(() => {
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
            :options="formattedGroups"
            label="Group Membership"
            :selectedOptions="groups"
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
                No groups selected
            </div>
        </Transition>
    </div>
</template>
