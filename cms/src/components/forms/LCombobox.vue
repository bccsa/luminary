<script setup lang="ts">
import { computed, ref, watch, type Ref, type StyleValue } from "vue";
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

interface Option {
    id: string | number;
    label: string;
    value: string;
    isSelected: Ref<boolean> | boolean;
}

type Props = {
    disabled?: boolean;
    options: Option[];
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const selectedOptions = defineModel<Option[]>("options");

const query = ref("");

watch(query, () => {
    if (query.value.length > 0) showOptions.value = true;
});

const input = ref();

const optionsDisplay = ref();
const showOptions = ref(false);

const { attrsWithoutStyles } = useAttrsWithoutStyles();

const focusInput = () => {
    showOptions.value = !showOptions.value;
    input.value.focus();
};

const selectOption = (id: string | number) => {
    props.options.forEach((option) => {
        if (option.id == id && !option.isSelected) {
            selectedOptions.value?.push({ ...option, isSelected: true });
        }
    });
    showOptions.value = false;
};

onClickOutside(optionsDisplay, () => (showOptions.value = false));
</script>

<template>
    <div class="relative" :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <FormLabel> Group membership </FormLabel>
        <div class="relative mt-2 flex w-full rounded-md" v-bind="attrsWithoutStyles">
            <LInput
                @click="showOptions = true"
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
                v-show="optionsDisplay"
                class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border-[1px] border-zinc-100 bg-white shadow-md"
                data-test="groups"
            >
                <ul
                    v-for="option in options"
                    :key="option.id"
                    :value="option"
                    :disabled="isOptionSelected(option.id)"
                >
                    <li
                        class="text-sm hover:bg-zinc-100"
                        :class="[
                            'relative cursor-default select-none py-2 pl-3 pr-9',
                            { 'bg-zinc-100': isOptionSelected(option.id) },
                            { 'text-zinc-900': !isOptionSelected(option.id) },
                            { 'text-zinc-500': disabled },
                        ]"
                        @click="selectOption(option.id)"
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
