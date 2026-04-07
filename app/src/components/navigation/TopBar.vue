<script setup lang="ts">
import { ChevronLeftIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRouter } from "vue-router";
import DesktopMenu from "./DesktopMenu.vue";
import SearchButton from "./SearchModal.vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { getRouteHistory } from "@/router";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { isMdScreen } from "@/globalConfig";

// Force Vite to return a URL string for these SVG assets (usable in CSS `url(...)` and `<img :src>`),
// regardless of any SVG/raw/component transforms/plugins.
import defaultLogo from "@/assets/logo.svg?url";
import defaultLogoDark from "@/assets/logo-dark.svg?url";
import defaultLogoSmall from "@/assets/logo-small.svg?url";

type Props = {
    showBackButton?: boolean;
};

withDefaults(defineProps<Props>(), {
    showBackButton: false,
});

const router = useRouter();
const LOGO = import.meta.env.VITE_LOGO || defaultLogo;
const LOGO_SMALL = import.meta.env.VITE_LOGO_SMALL || "";
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK || defaultLogoDark;
const LOGO_SMALL_DARK = import.meta.env.VITE_LOGO_SMALL_DARK || "";

const logoWidth = ref();
const logoContainer = ref<HTMLElement | undefined>(undefined);
const isSmallScreen = ref(false);

const logo = computed(() =>
    isSmallScreen.value ? (LOGO_SMALL || defaultLogoSmall) : LOGO,
);
const logoDark = computed(() =>
    isSmallScreen.value ? (LOGO_SMALL_DARK || defaultLogoSmall) : LOGO_DARK,
);

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

const isPostAndNoHistory = computed(() => {
    return getRouteHistory().value.length <= 1 && router.currentRoute.value.name === "content";
});

// On desktop (md+), mount SearchModal immediately so keyboard shortcuts (Ctrl+K) work.
// On mobile, defer mounting until the user first opens search to avoid initialisation errors.
const { isSearchOpen } = useSearchOverlay();
const searchMounted = ref(isMdScreen.value);
const unwatch = watch(isSearchOpen, (open) => {
    if (open) {
        searchMounted.value = true;
        unwatch();
    }
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
                            @click="
                                isPostAndNoHistory ? router.push({ name: 'home' }) : router.back()
                            "
                        />
                    </div>

                    <div
                        class="flex flex-1 items-center"
                        ref="logoContainer"
                    >
                        <div
                            :style="logoCss"
                            class="h-8 bg-[image:var(--image-url)] bg-cover bg-center dark:bg-[image:var(--image-url-dark)]"
                        >
                            <!-- Show the image with 0 opacity to set the outer div's size. We assume that the dark mode logo will have the same size as the light mode logo. -->
                            <img
                                class="h-full opacity-0"
                                :src="logo"
                            />
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
        <!-- SearchButton: always mounted on desktop for keyboard shortcuts; lazily mounted on mobile -->
        <SearchButton
            v-if="searchMounted"
            ref="searchButtonRef"
        />
    </header>
</template>
