<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
    DocumentDuplicateIcon,
    VideoCameraIcon,
    HomeIcon,
    UsersIcon,
} from "@heroicons/vue/24/outline";
import { useGlobalConfigStore } from "@/stores/globalConfig";

const { appName } = useGlobalConfigStore();

const navigation = [
    { name: "Dashboard", to: { name: "dashboard" }, icon: HomeIcon },
    {
        name: "Posts",
        to: { name: "posts" },
        icon: DocumentDuplicateIcon,
    },
    { name: "Videos", to: { name: "videos" }, icon: VideoCameraIcon },
    { name: "Users", to: { name: "users" }, icon: UsersIcon },
];
</script>

<template>
    <div class="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-6 pb-4">
        <div class="flex h-16 shrink-0 items-center">
            <img class="w-52" src="@/assets/logo_white.svg" :alt="appName" />
        </div>
        <nav class="flex flex-1 flex-col">
            <ul role="list" class="flex flex-1 flex-col gap-y-7">
                <li>
                    <ul role="list" class="-mx-2 space-y-1">
                        <li v-for="item in navigation" :key="item.name">
                            <RouterLink
                                :to="item.to"
                                active-class="bg-gray-800 text-white"
                                class="group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 text-gray-400 hover:bg-gray-800 hover:text-white"
                            >
                                <component
                                    :is="item.icon"
                                    class="h-6 w-6 shrink-0"
                                    aria-hidden="true"
                                />
                                {{ item.name }}
                            </RouterLink>
                        </li>
                    </ul>
                </li>
            </ul>
        </nav>
    </div>
</template>
