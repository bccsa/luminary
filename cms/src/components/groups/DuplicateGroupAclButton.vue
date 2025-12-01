<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import { toRaw, toRefs, ref } from "vue";
import LButton from "../button/LButton.vue";
import LDropdown from "../common/LDropdown.vue";

type Props = {
    groups: GroupDto[];
};

const props = defineProps<Props>();

const { groups } = toRefs(props);
const show = ref(false);

const emit = defineEmits(["select"]);

const selectGroup = (group: GroupDto) => {
    emit("select", toRaw(group));
};
</script>

<template>
    <div class="relative">
        <div class="inline-block text-left">
            <LButton
                :icon="DocumentDuplicateIcon"
                class="gap-x-0"
                variant="tertiary"
                size="sm"
                title="Duplicate"
                data-test="duplicateAclIcon"
                @click.stop="show = !show"
            />
            <div v-if="show">
                <LDropdown
                    class="absolute right-0 z-20 mt-2 w-52 origin-top-left divide-y divide-zinc-100 rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
                    :show="true"
                >
                    <div class="px-1 py-1">
                        <div v-for="group in groups" :key="group._id">
                            <button
                                :class="[
                                    'group flex w-full items-center rounded-md px-2 py-2 text-sm hover:bg-zinc-100 focus:bg-zinc-100',
                                ]"
                                @click="() => selectGroup(group)"
                                data-test="selectGroupIcon"
                            >
                                {{ group.name }}
                            </button>
                        </div>
                        <div v-if="groups.length == 0">
                            <div class="px-2 py-2 text-sm text-zinc-500">All groups added</div>
                        </div>
                    </div>
                </LDropdown>
            </div>
        </div>
    </div>
</template>
