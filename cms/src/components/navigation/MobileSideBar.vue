<script setup lang="ts">
import { XMarkIcon } from "@heroicons/vue/24/outline";
import SideBar from "@/components/navigation/SideBar.vue";
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";

type Props = {
    open: boolean;
};

withDefaults(defineProps<Props>(), {
    open: false,
});

const emit = defineEmits(["update:open"]);
const sidebarRef = ref<HTMLElement | null>(null);

onClickOutside(sidebarRef, () => {
    emit("update:open", false);
});
</script>

<template>
    <div v-if="open" class="relative z-50 overflow-hidden lg:hidden">
        <div class="fixed inset-0 bg-zinc-900/50" />

        <div class="fixed inset-0 flex">
            <div ref="sidebarRef" v-if="open" class="relative mr-16 flex w-full max-w-xs flex-1">
                <div class="absolute left-full top-0 flex w-16 justify-center pt-5">
                    <button type="button" class="-m-2.5 p-2.5" @click="emit('update:open', false)">
                        <span class="sr-only">Close sidebar</span>
                        <XMarkIcon class="h-6 w-6 text-white" aria-hidden="true" />
                    </button>
                </div>

                <SideBar />
            </div>
        </div>
    </div>
</template>
