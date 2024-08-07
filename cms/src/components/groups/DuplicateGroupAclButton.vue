<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { Menu, MenuButton, MenuItems, MenuItem } from "@headlessui/vue";
import { DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import { toRaw, toRefs } from "vue";
import LButton from "../button/LButton.vue";

type Props = {
    groups: GroupDto[];
};

const props = defineProps<Props>();

const { groups } = toRefs(props);

const emit = defineEmits(["select"]);

const selectGroup = (group: GroupDto) => {
    emit("select", toRaw(group));
};
</script>

<template>
    <div class="relative">
        <Menu as="div" class="inline-block text-left">
            <div>
                <MenuButton
                    :as="LButton"
                    :icon="DocumentDuplicateIcon"
                    class="gap-x-0"
                    variant="tertiary"
                    size="sm"
                    title="Duplicate"
                    data-test="duplicateAclIcon"
                />
            </div>

            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <MenuItems
                    class="absolute right-0 z-20 mt-2 w-52 origin-top-left divide-y divide-zinc-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
                >
                    <div class="px-1 py-1">
                        <MenuItem v-slot="{ active }" v-for="group in groups" :key="group._id">
                            <button
                                :class="[
                                    'group flex w-full items-center rounded-md px-2 py-2 text-sm',
                                    { 'bg-zinc-100': active },
                                ]"
                                @click="() => selectGroup(group)"
                                data-test="selectGroupIcon"
                            >
                                {{ group.name }}
                            </button>
                        </MenuItem>
                        <MenuItem v-if="groups.length == 0">
                            <div class="px-2 py-2 text-sm text-zinc-500">All groups added</div>
                        </MenuItem>
                    </div>
                </MenuItems>
            </transition>
        </Menu>
    </div>
</template>
