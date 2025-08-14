<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { ChevronDownIcon } from "@heroicons/vue/20/solid";
import { ref, toRaw, toRefs } from "vue";
import LButton from "../button/LButton.vue";
import { sortByName } from "@/util/sortByName";

type Props = {
    groups: GroupDto[];
};

const props = defineProps<Props>();

const { groups } = toRefs(props);

const emit = defineEmits(["select"]);

const selectGroup = (group: GroupDto) => {
    emit("select", toRaw(group));
};

const showGroups = ref(false);
</script>

<template>
    <div class="relative">
        <div class="inline-block text-left">
            <div>
                <LButton
                    @click="() => (showGroups = !showGroups)"
                    data-test="addGroupButton"
                    :icon="ChevronDownIcon"
                    icon-right
                >
                    Add access
                </LButton>
            </div>

            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <div
                    v-if="showGroups"
                    class="absolute left-0 z-20 mt-2 w-52 origin-top-left divide-y divide-zinc-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
                >
                    <ul class="px-1 py-1">
                        <!-- v-slot="{ active }" -->
                        <li
                            v-for="group in groups.sort(sortByName)"
                            :key="group._id"
                            data-test="group-items"
                        >
                            <button
                                :class="[
                                    'group flex w-full items-center rounded-md px-2 py-2 text-sm hover:bg-zinc-100',
                                ]"
                                @click="() => selectGroup(group)"
                                data-test="selectGroupButton"
                            >
                                {{ group.name }}
                            </button>
                        </li>
                        <li v-if="groups.length == 0">
                            <div class="px-2 py-2 text-sm text-zinc-500">All groups added</div>
                        </li>
                    </ul>
                </div>
            </transition>
        </div>
    </div>
</template>
