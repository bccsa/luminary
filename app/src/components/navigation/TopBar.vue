<script setup lang="ts">
import { ChevronLeftIcon, ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRoute, useRouter } from "vue-router";
import DesktopMenu from "./DesktopMenu.vue";
import { computed, onMounted, ref, type FunctionalComponent } from "vue";
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

// Define valid themes
type Theme = "Light" | "Dark" | "System";

// Map theme names to icons
const themeIcon: Record<Theme, FunctionalComponent> = {
    Light: SunIcon,
    Dark: MoonIcon,
    System: ComputerDesktopIcon,
};

// Current theme state
const currentTheme = ref<Theme>((localStorage.getItem("theme") as Theme) || "System");

// Pass the logo URL's to tailwind's classes (see https://stackoverflow.com/questions/70805041/background-image-in-tailwindcss-using-dynamic-url-react-js)
const logoCss = computed(
    () => "--image-url: url(" + logo.value + "); --image-url-dark: url(" + logoDark.value + ");",
);

// Detect screen size on load and window resize
const updateScreenSize = () => {
    isSmallScreen.value = window.innerWidth < 300; // Tailwind 'sm' breakpoint
};

onMounted(() => {
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

                <component
                    :is="themeIcon[currentTheme]"
                    @click="isVisible = true"
                    class="m-2-3 h-6 w-6 cursor-pointer text-zinc-600 dark:text-slate-50"
                />
                {{ currentTheme }}
                <ProfileMenu />
            </div>
        </div>
    </header>
    <ThemeSelectorModal :isVisible="isVisible" @close="isVisible = false" />
</template>
