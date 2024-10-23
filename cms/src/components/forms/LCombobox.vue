<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronUpDownIcon } from "@heroicons/vue/20/solid";
import LTag from "../content/LTag.vue";
import {
    db,
    DocType,
    type Uuid,
    type GroupDto,
    verifyAccess,
    AclPermission,
} from "luminary-shared";

// type Props = {
//     disabled?: boolean;
//     docType: DocType;
// };
// const props = withDefaults(defineProps<Props>(), {
//     disabled: false,
// });
// const groups = defineModel<Uuid[]>("groups");

// const availableGroups = db.whereTypeAsRef<GroupDto[]>(DocType.Group, []);

// const assignableGroups = computed(() =>
//     availableGroups.value?.filter((g) =>
//         verifyAccess([g._id], props.docType, AclPermission.Edit, "any"),
//     ),
// );

// const selectedGroups = computed(() =>
//     availableGroups.value?.filter((g) => groups.value?.includes(g._id)),
// );

// const isGroupSelected = computed(() => {
//     return (groupId: string) => {
//         if (!groups.value) return false;
//         return groups.value.some((g) => g == groupId);
//     };
// });

// const query = ref("");
// const filteredGroups = computed(() =>
//     query.value === ""
//         ? assignableGroups.value
//         : assignableGroups.value.filter((group) => {
//               return group.name.toLowerCase().includes(query.value.toLowerCase());
//           }),
// );
</script>

<template>
    <div>
        <div class="mt-3 flex flex-wrap gap-3">
            <TransitionGroup
                enter-active-class="transition duration-150 delay-75"
                enter-from-class="transform scale-90 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-100"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-90 opacity-0"
            >
                <LTag
                    v-for="group in selectedGroups"
                    :key="group._id"
                    @remove="() => groups?.splice(groups?.indexOf(group._id), 1)"
                    :disabled="disabled"
                >
                    {{ group.name }}
                </LTag>
            </TransitionGroup>
        </div>
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
