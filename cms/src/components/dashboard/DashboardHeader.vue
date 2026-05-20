<script setup lang="ts">
import { computed } from "vue";
import { syncActive } from "luminary-shared";
import { useAuth0 } from "@auth0/auth0-vue";
import { isAuthBypassed } from "@/auth";
import { ArrowPathIcon } from "@heroicons/vue/20/solid";

const auth0 = isAuthBypassed ? null : useAuth0();
const userName = computed(() =>
    isAuthBypassed ? "E2E Test User" : (auth0?.user.value?.name ?? "User"),
);

const greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
});
</script>

<template>
    <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col lg:flex-row lg:items-baseline lg:gap-2">
            <h1 class="text-lg font-semibold text-zinc-900">{{ greeting }}, {{ userName }}</h1>
            <p class="text-xs text-zinc-500">Here's what's happening today</p>
        </div>
        <div class="flex items-center gap-2">
            <!-- Sync indicator -->
            <div
                v-if="syncActive"
                class="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
            >
                <ArrowPathIcon class="h-3.5 w-3.5 animate-spin" />
                Syncing
            </div>
        </div>
    </div>
</template>
