<script setup lang="ts">
import { ChevronLeftIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRoute, useRouter } from "vue-router";
import DesktopMenu from "./DesktopMenu.vue";
import { computed, onMounted, ref } from "vue";

const route = useRoute();
const router = useRouter();
const LOGO = import.meta.env.VITE_LOGO;
const LOGO_SMALL = import.meta.env.VITE_LOGO_SMALL;

// Reactive screen size check
const isSmallScreen = ref(false);

const logo = computed(() => (isSmallScreen.value ? LOGO_SMALL : LOGO));

// Detect screen size on load and window resize
const updateScreenSize = () => {
    isSmallScreen.value = window.innerWidth < 300; // Tailwind 'md' breakpoint
};

onMounted(() => {
    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);
});
</script>

<template>
    <header>
        <div class="z-40 bg-zinc-100 dark:bg-slate-800">
            <div class="flex flex-row items-center justify-between px-4 py-3">
                <div @click="router.back()" class="flex items-center">
                    <div
                        class="mr-4 border-r border-zinc-400 pr-4"
                        :class="{
                            hidden: route.name == 'home' || route.name == 'explore',
                            'lg:hidden': route.name != 'home',
                        }"
                    >
                        <ChevronLeftIcon class="h-6 w-6 text-zinc-600 dark:text-slate-50" />
                    </div>

                    <img :src="logo" />
                </div>

                <DesktopMenu class="hidden w-2/3 gap-2 lg:flex" />

                <div class="flex items-center gap-4">
                    <ProfileMenu />
                </div>
            </div>
        </div>
    </header>
</template>
