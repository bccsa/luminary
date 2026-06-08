<script setup lang="ts">
import { ChevronLeftIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRouter } from "vue-router";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getRouteHistory } from "@/router";
import { useAuthWithPrivacyPolicy } from "@/composables/useAuthWithPrivacyPolicy";
import { isConnected } from "luminary-shared";
import { useNotificationStore, type Notification } from "@/stores/notification";
import { useI18n } from "vue-i18n";
import { ArrowLeftEndOnRectangleIcon } from "@heroicons/vue/24/outline";

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

// On web/SSG the logo + nav links (DesktopMenu) ARE prerendered (crawlable), but
// the per-user ProfileMenu (avatar/language/auth → Dexie) is rendered only after
// mount so it doesn't crash during the Node prerender and the signed-out shell
// matches the first client render. Native renders it immediately (unchanged).
const isWeb = import.meta.env.VITE_BUILD_TARGET === "web";
const isMounted = ref(false);
const showProfile = computed(() => !isWeb || isMounted.value);

const LOGO = import.meta.env.VITE_LOGO || defaultLogo;
const LOGO_SMALL = import.meta.env.VITE_LOGO_SMALL || "";
const LOGO_DARK = import.meta.env.VITE_LOGO_DARK || defaultLogoDark;
const LOGO_SMALL_DARK = import.meta.env.VITE_LOGO_SMALL_DARK || "";

const logoWidth = ref();
const logoContainer = ref<HTMLElement | undefined>(undefined);
const isSmallScreen = ref(false);

const logo = computed(() => (isSmallScreen.value ? LOGO_SMALL || defaultLogoSmall : LOGO));
const logoDark = computed(() =>
    isSmallScreen.value ? LOGO_SMALL_DARK || defaultLogoSmall : LOGO_DARK,
);

// Pass the logo URL's to tailwind's classes (see https://stackoverflow.com/questions/70805041/background-image-in-tailwindcss-using-dynamic-url-react-js)
const logoCss = computed(
    () => "--image-url: url(" + logo.value + "); --image-url-dark: url(" + logoDark.value + ");",
);

const updateScreenSize = () => {
    if (!logoWidth.value) return;
    if (!logoContainer.value) return;
    isSmallScreen.value = logoWidth.value > logoContainer.value.clientWidth;
};

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
    isMounted.value = true;
    const img = new Image();
    img.src = LOGO;
    img.onload = () => {
        logoWidth.value = (img.width * 32) / img.height; // 32px = tailwind h-8
        updateScreenSize();
    };

    // Observe the container so we re-measure whenever surrounding layout settles
    // (i18n strings hydrating, ProfileMenu/avatar loading, viewport resize, etc.)
    if (logoContainer.value) {
        resizeObserver = new ResizeObserver(updateScreenSize);
        resizeObserver.observe(logoContainer.value);
    }
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
});

const isPostAndNoHistory = computed(() => {
    return getRouteHistory().value.length <= 1 && router.currentRoute.value.name === "content";
});

const { isAuthenticated, loginWithRedirect } = useAuthWithPrivacyPolicy();
const { t } = useI18n();

const handleLogin = () => {
    if (isConnected.value) {
        loginWithRedirect();
        return;
    }
    useNotificationStore().addNotification({
        id: "no-internet-connection-login",
        title: t("profile_menu.login.offline_notification_title"),
        description: t("profile_menu.login.offline_notification"),
        type: "toast",
        state: "error",
    } as Notification);
};
</script>

<template>
    <header>
        <div class="z-40 bg-zinc-100 dark:bg-slate-800">
            <div class="flex items-center gap-2 py-5 pl-6 pr-4 lg:pr-5">
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
                    </div>
                </div>

                <div class="flex cursor-pointer items-center gap-2">
                    <slot name="quickControls" />
                </div>
                <div
                    v-if="showProfile"
                    class="hidden lg:block"
                >
                    <ProfileMenu />
                </div>
                <div class="lg:hidden">
                    <!-- Same hover/padding treatment as the quick controls (language, theme) so
                         the whole row reacts consistently. -->
                    <button
                        v-if="!isAuthenticated"
                        class="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                        @click="handleLogin"
                    >
                        {{ t("profile_menu.login") }}
                        <ArrowLeftEndOnRectangleIcon class="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    </header>
</template>
