<script setup lang="ts">
import { ChevronLeftIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRouter } from "vue-router";
import DesktopMenu from "./DesktopMenu.vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";

// Logos imports
import logoLight from "@/assets/logo.svg";
import logoDark from "@/assets/logo-dark.svg";
import logoSmallLight from "@/assets/logo-small.svg";
import logoSmallDark from "@/assets/logo-small.svg";

type Props = {
    showBackButton?: boolean;
};

withDefaults(defineProps<Props>(), {
    showBackButton: false,
});

const router = useRouter();

const logoWidth = ref();
const logoContainer = ref<HTMLElement | undefined>(undefined);
const isSmallScreen = ref(false);

const logo = computed(() => (isSmallScreen.value ? logoSmallLight : logoLight));
const logoDarkComputed = computed(() => (isSmallScreen.value ? logoSmallDark : logoDark));

// Pass the logo URL's to tailwind's classes (see https://stackoverflow.com/questions/70805041/background-image-in-tailwindcss-using-dynamic-url-react-js)
const logoCss = computed(
    () =>
        "--image-url: url(" +
        logo.value +
        "); --image-url-dark: url(" +
        logoDarkComputed.value +
        ");",
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
        img.src = logoLight;
        img.onload = () => {
            if (!logoContainer.value) return;
            logoWidth.value = (img.width * 32) / img.height; // 32px = tailwind h-8
        };
    }

    watch(
        [logoWidth],
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
                        v-if="showBackButton"
                        data-test="backButton"
                    >
                        <ChevronLeftIcon
                            class="-ml-2 h-6 w-6 cursor-pointer text-zinc-600 dark:text-slate-50"
                            @click="router.back()"
                        />
                    </div>

                    <div class="flex flex-1 items-center" ref="logoContainer">
                        <div
                            :style="logoCss"
                            class="h-8 bg-[image:var(--image-url)] bg-cover bg-center dark:bg-[image:var(--image-url-dark)]"
                        >
                            <!-- Show the image with 0 opacity to set the outer div's size. We assume that the dark mode logo will have the same size as the light mode logo. -->
                            <img class="h-full opacity-0" :src="logo" />
                        </div>

                        <DesktopMenu class="ml-6 hidden lg:flex" />
                    </div>
                </div>

                <div class="ml-2 mr-5 flex cursor-pointer items-center gap-4">
                    <slot name="quickControls" />
                </div>
                <ProfileMenu />
            </div>
        </div>
    </header>
</template>
