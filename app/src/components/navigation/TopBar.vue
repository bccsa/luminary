<script setup lang="ts">
import { ChevronLeftIcon, SunIcon } from "@heroicons/vue/24/solid";
import { MoonIcon } from "@heroicons/vue/24/outline";
import ProfileMenu from "./ProfileMenu.vue";
import { useRouter } from "vue-router";
import DesktopMenu from "./DesktopMenu.vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { isDarkTheme, showContentQuickControls, theme } from "@/globalConfig";

const router = useRouter();
const LOGO = import.meta.env.VITE_LOGO;
const LOGO_SMALL = import.meta.env.VITE_LOGO_SMALL;
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK;
const LOGO_SMALL_DARK = import.meta.env.VITE_LOGO_SMALL_DARK;

const logoWidth = ref(parseInt(sessionStorage.getItem("logoWidth") || "0"));

const logoContainer = ref<HTMLElement | undefined>(undefined);

const isSmallScreen = ref(false);

const logo = computed(() => (isSmallScreen.value ? LOGO_SMALL : LOGO));
const logoDark = computed(() => (isSmallScreen.value ? LOGO_SMALL_DARK : LOGO_DARK));

// Pass the logo URL's to tailwind's classes (see https://stackoverflow.com/questions/70805041/background-image-in-tailwindcss-using-dynamic-url-react-js)
const logoCss = computed(
    () => "--image-url: url(" + logo.value + "); --image-url-dark: url(" + logoDark.value + ");",
);

// Detect screen size on load and window resize
const updateScreenSize = () => {
    if (!logoWidth.value) return;
    if (!logoContainer.value) return;
    isSmallScreen.value = logoWidth.value > logoContainer.value.clientWidth;
};

onMounted(() => {
    if (!logoWidth.value) {
        const img = new Image();
        img.src = LOGO;
        img.onload = () => {
            if (!logoContainer.value) return;
            logoWidth.value = (img.width * logoContainer.value.clientHeight) / img.height;
            sessionStorage.setItem("logoWidth", img.width.toString());
        };
    }

    watch(
        [showContentQuickControls, logoWidth],
        async () => {
            await nextTick();
            updateScreenSize();
        },
        { immediate: true },
    );

    window.addEventListener("resize", updateScreenSize);
});
</script>

<template>
    <header>
        <div class="z-40 bg-zinc-100 dark:bg-slate-800">
            <div class="flex items-center py-5 pl-6 pr-6 lg:pr-5">
                <div class="flex flex-1 items-center">
                    <div
                        class="mr-4 border-r border-zinc-400 pr-4"
                        v-if="showContentQuickControls"
                        data-test="backButton"
                    >
                        <ChevronLeftIcon
                            class="h-6 w-6 cursor-pointer text-zinc-600 dark:text-slate-50"
                            @click="router.back()"
                        />
                    </div>

                    <div class="flex flex-1 items-center" ref="logoContainer">
                        <div
                            :style="logoCss"
                            class="bg-[image:var(--image-url)] bg-cover bg-center dark:bg-[image:var(--image-url-dark)]"
                        >
                            <!-- Show the image with 0 opacity to set the outer div's size. We assume that the dark mode logo will have the same size as the light mode logo. -->
                            <img class="h-8 opacity-0" :src="logo" />
                        </div>

                        <DesktopMenu class="ml-6 hidden lg:flex" />
                    </div>
                </div>

                <div class="ml-2 mr-6" v-if="showContentQuickControls" data-test="quickControls">
                    <div class="flex cursor-pointer items-center">
                        <div class="text-zinc-400 dark:text-slate-300">
                            <SunIcon class="h-6 w-6" v-if="isDarkTheme" @click="theme = 'light'" />
                            <MoonIcon class="h-6 w-6" v-else @click="theme = 'dark'" />
                        </div>
                    </div>
                </div>
                <ProfileMenu />
            </div>
        </div>
    </header>
</template>
