<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/vue";
import {
    ArrowLeftEndOnRectangleIcon,
    Cog6ToothIcon,
    LanguageIcon,
    UserIcon,
} from "@heroicons/vue/20/solid";
import { useAuth0 } from "@auth0/auth0-vue";
import { cmsLanguageIdAsRef, isDevMode } from "@/globalConfig";
import { useRouter } from "vue-router";
import { computed, onMounted, ref, watch } from "vue";
import LanguageModal from "../modals/LanguageModal.vue";
import type { LanguageDto } from "luminary-shared";
import { db, DocType } from "luminary-shared";
import { PlayIcon } from "@heroicons/vue/16/solid";
import { isAuthBypassed } from "@/auth";

// In auth bypass mode, use mock user data
const auth0 = isAuthBypassed ? null : useAuth0();
const user = computed(() =>
    isAuthBypassed ? { name: "E2E Test User", email: "e2e@test.local" } : auth0?.user.value,
);
const logout = isAuthBypassed
    ? () => console.warn("Logout called in auth bypass mode")
    : auth0!.logout;
const router = useRouter();

const showLanguageModal = ref(false);

const userNavigation = [
    { name: "Settings", action: () => router.push({ name: "settings" }), icon: Cog6ToothIcon },
    {
        name: "Language",
        language: cmsLanguageIdAsRef.value,
        action: () => (showLanguageModal.value = true),
        icon: LanguageIcon,
    },
    {
        name: "Sign out",

        icon: ArrowLeftEndOnRectangleIcon,
        action: () =>
            logout({
                logoutParams: { returnTo: window.location.origin },
            }),
    },
];

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const languageToDisplay = ref("");

if (isDevMode) {
    userNavigation.push({
        name: "Sandbox",
        action: () => router.push({ name: "sandbox" }),
        icon: PlayIcon,
    });
}

onMounted(() => {
    // Update languageToDisplay when languages or cmsLanguageIdAsRef changes
    watch(
        [languages, cmsLanguageIdAsRef],
        ([newLanguages, langId]) => {
            if (newLanguages.length > 0) {
                const matchedLanguage = newLanguages.find((l) => l._id == langId);
                languageToDisplay.value = matchedLanguage?.name ?? "Default Language";

                // Set cmsLanguageIdAsRef if it's not already defined
                if (!langId) {
                    cmsLanguageIdAsRef.value = newLanguages[0]._id;
                }
            }
        },
        { immediate: true },
    );
});
</script>

<template>
    <Menu as="div" class="relative w-full">
        <MenuButton class="flex w-full items-center">
            <div class="flex-none">
                <span class="sr-only">Open user menu</span>
                <img
                    v-if="user?.picture"
                    :src="user.picture"
                    alt=""
                    class="h-8 w-8 rounded-full bg-zinc-50 object-cover"
                />
                <div
                    v-else
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-300"
                >
                    <UserIcon class="h-6 w-6 text-zinc-600" />
                </div>
            </div>

            <div class="ml-2 truncate">
                <span class="text-sm font-semibold leading-6 text-zinc-900">
                    {{ user?.name }}
                </span>
            </div>
        </MenuButton>

        <transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
        >
            <MenuItems
                class="absolute bottom-10 right-0 z-50 mt-2.5 w-48 origin-top-left rounded-md bg-white py-2 shadow-lg ring-1 ring-zinc-900/5 focus:outline-none"
            >
                <MenuItem v-for="item in userNavigation" :key="item.name" v-slot="{ active }">
                    <button
                        :class="[
                            active ? 'bg-zinc-50' : '',
                            'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm leading-6 text-zinc-900 ',
                        ]"
                        @click="item.action"
                    >
                        <component
                            :is="item.icon"
                            class="h-5 w-5 flex-shrink-0 text-zinc-500"
                            aria-hidden="true"
                        />
                        <div class="flex flex-col text-nowrap leading-none">
                            {{ item.name }}
                            <span
                                class="text-[12px] text-zinc-500"
                                v-if="item.name == 'Language'"
                                >{{ languageToDisplay }}</span
                            >
                        </div>
                    </button>
                </MenuItem>
            </MenuItems>
        </transition>
    </Menu>
    <LanguageModal v-model:is-visible="showLanguageModal" />
</template>
