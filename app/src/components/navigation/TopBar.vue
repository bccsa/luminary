<script setup lang="ts">
import { ChevronLeftIcon, MoonIcon, SunIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRoute, useRouter } from "vue-router";
import DesktopMenu from "./DesktopMenu.vue";
import { computed, onMounted, ref } from "vue";
import ThemeSelectorModal from "./ThemeSelectorModal.vue";

const route = useRoute();
const router = useRouter();
const LOGO = import.meta.env.VITE_LOGO;
const LOGO_SMALL = import.meta.env.VITE_LOGO_SMALL;
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK;
const LOGO_SMALL_DARK = import.meta.env.VITE_LOGO_SMALL_DARK;

const isSmallScreen = ref(false);
const isVisible = ref(false);

const logo = computed(() => (isSmallScreen.value ? LOGO_SMALL : LOGO));
const logoDark = computed(() => (isSmallScreen.value ? LOGO_SMALL_DARK : LOGO_DARK));

// Handle theme state manually
const isDarkMode = ref(false);

const toggleTheme = () => {
    isDarkMode.value = !isDarkMode.value;
    localStorage.setItem("theme", isDarkMode.value ? "Dark" : "Light");
    document.documentElement.classList.toggle("dark", isDarkMode.value);
};

const syncTheme = () => {
    const savedTheme = localStorage.getItem("theme") || "Light";
    isDarkMode.value = savedTheme === "Dark";
    document.documentElement.classList.toggle("dark", isDarkMode.value);
};

// Pass the logo URL's to tailwind's classes (see https://stackoverflow.com/questions/70805041/background-image-in-tailwindcss-using-dynamic-url-react-js)
const logoCss = computed(
    () => "--image-url: url(" + logo.value + "); --image-url-dark: url(" + logoDark.value + ");",
);

// Detect screen size on load and window resize
const updateScreenSize = () => {
    isSmallScreen.value = window.innerWidth < 300; // Tailwind 'sm' breakpoint
};

onMounted(() => {
    syncTheme();
    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);
});
</script>

<template>
    <header>
        <div class="z-40 bg-zinc-100 dark:bg-slate-800" v-bind="$attrs">
            <div class="flex items-center py-5 pl-6 pr-6 lg:pr-5">
                <div @click="router.back()" class="mr-4 flex items-center">
                    <div
                        class="mr-4 border-r border-zinc-400 pr-4"
                        :class="{
                            hidden: route.name == 'home' || route.name == 'explore',
                            'lg:hidden': route.name != 'home',
                        }"
                    >
                        <ChevronLeftIcon class="h-6 w-6 text-zinc-600 dark:text-slate-50" />
                    </div>

                    <div
                        :style="logoCss"
                        class="bg-[image:var(--image-url)] bg-cover bg-center dark:bg-[image:var(--image-url-dark)]"
                    >
                        <!-- Show the image with 0 opacity to set the outer div's size. We assume that the dark mode logo will have the same size as the light mode logo. -->
                        <img class="h-8 opacity-0" :src="logo" />
                    </div>
                </div>

                <DesktopMenu class="hidden lg:flex" />
                <div class="flex-1" />
                <div class="mx-4">
                    <div @click="toggleTheme" class="flex cursor-pointer items-center">
                        <div class="text-zinc-500 dark:text-slate-300">
                            <SunIcon class="h-6 w-6" v-if="isDarkMode" />
                            <MoonIcon class="h-6 w-6" v-else />
                        </div>
                    </div>
                </div>
                <ProfileMenu class="ml-6" />
            </div>
        </div>
    </header>
    <ThemeSelectorModal
        :isVisible="isVisible"
        :theme="isDarkMode ? 'Dark' : 'Light'"
        @close="isVisible = false"
    />
</template>
