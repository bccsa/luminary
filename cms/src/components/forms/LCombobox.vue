<script setup lang="ts">
import { computed, ref, watch, type StyleValue } from "vue";
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
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import FormLabel from "./FormLabel.vue";
import LInput from "./LInput.vue";
import { onClickOutside } from "@vueuse/core";

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

const selectedGroups = computed(() =>
    availableGroups.value?.filter((g) => groups.value?.includes(g._id)),
);

const isGroupSelected = computed(() => {
    return (groupId: string) => {
        if (!groups.value) return false;
        return groups.value.some((g) => g == groupId);
    };
});

const query = ref("");

watch(query, () => {
    if (query.value.length > 0) showGroups.value = true;
});

const filteredGroups = computed(() =>
    query.value === ""
        ? assignableGroups.value
        : assignableGroups.value.filter((group) => {
              return group.name.toLowerCase().includes(query.value.toLowerCase());
          }),
);

const input = ref();

const groupsDisplay = ref();
const showGroups = ref(false);

const { attrsWithoutStyles } = useAttrsWithoutStyles();

const focusInput = () => {
    showGroups.value = !showGroups.value;
    input.value.focus();
};

onClickOutside(groupsDisplay, () => (showGroups.value = false));
</script>

<template>
    <div class="relative" :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <FormLabel> Group membership </FormLabel>
        <div class="relative mt-2 flex w-full rounded-md" v-bind="attrsWithoutStyles">
            <LInput
                @click="showGroups = true"
                v-model="query"
                ref="input"
                class="w-full"
                placeholder="Type to select..."
                name="group-search"
            />
            <button name="options-open-btn" @click="focusInput">
                <ChevronUpDownIcon
                    class="absolute right-2 top-2 h-5 w-5 text-zinc-400 hover:cursor-pointer"
                />
            </button>
        </div>

        <transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-out"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
        >
            <div
                ref="groupsDisplay"
                v-show="showGroups"
                class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border-[1px] border-zinc-100 bg-white shadow-md"
                data-test="groups"
            >
                <ul
                    v-for="group in filteredGroups"
                    :key="group._id"
                    :value="group"
                    :disabled="isGroupSelected(group._id)"
                >
                    <li
                        class="text-sm hover:bg-zinc-100"
                        :class="[
                            'relative cursor-default select-none py-2 pl-3 pr-9',
                            { 'bg-zinc-100': isGroupSelected(group._id) },
                            { 'text-zinc-900': !isGroupSelected(group._id) },
                            { 'text-zinc-500': disabled },
                        ]"
                        @click="
                            () => {
                                groups?.push(group._id);
                                showGroups = false;
                            }
                        "
                    >
                        <span class="block truncate" data-test="group-selector">
                            {{ group.name }}
                        </span>
                    </li>
                </ul>
            </div>
        </transition>
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
