<script setup lang="ts">
import { ref, onMounted } from "vue";
import LDialog from "@/components/common/LDialog.vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import {
    getAvailableProviders,
    clearAuth0Cache,
    showProviderSelectionModal,
    loginWithProvider,
} from "@/auth";
import type { OAuthProviderPublicDto } from "luminary-shared";

const providers = ref<OAuthProviderPublicDto[]>([]);
const isLoading = ref(true);

const handleProviderSelect = async (provider: OAuthProviderPublicDto) => {
    clearAuth0Cache();
    await loginWithProvider(provider, { prompt: "login" });
};

const handleClose = () => {
    showProviderSelectionModal.value = false;
};

onMounted(async () => {
    providers.value = await getAvailableProviders();
    isLoading.value = false;
});
</script>

<template>
    <LDialog
        title="Sign in"
        v-model:open="showProviderSelectionModal"
        description="Select an authentication provider to continue"
        :secondaryAction="handleClose"
        secondaryButtonText="Cancel"
    >
        <!-- Loading spinner -->
        <div
            v-if="isLoading"
            class="flex justify-center py-6"
        >
            <div
                class="h-8 w-8 animate-spin rounded-full border-b-2 border-zinc-900 dark:border-slate-200"
            ></div>
        </div>

        <!-- Provider list -->
        <div
            v-else
            class="flex flex-col gap-3"
        >
            <button
                v-for="provider in providers"
                :key="provider.id"
                class="group relative flex h-full w-full items-center justify-start overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-5 pl-12 hover:shadow-sm dark:border-slate-600 dark:bg-slate-700"
                :style="
                    provider.backgroundColor
                        ? {
                              backgroundColor: provider.backgroundColor,
                              borderColor: provider.backgroundColor,
                              color: provider.textColor,
                          }
                        : {}
                "
                @click="handleProviderSelect(provider)"
            >
                <div
                    class="pointer-events-none absolute inset-0 bg-white opacity-0 group-hover:opacity-20"
                ></div>
                <div class="absolute left-4 flex shrink-0 items-center justify-center">
                    <img
                        v-if="provider.icon"
                        :src="provider.icon"
                        :alt="provider.label"
                        class="h-5 w-5 object-contain"
                    />
                </div>
                <span
                    class="text-start text-[15px] font-medium text-zinc-700 group-hover:text-zinc-900 dark:text-slate-200 dark:group-hover:text-white"
                    :style="
                        provider.textColor
                            ? {
                                  color: provider.textColor,
                              }
                            : {}
                    "
                >
                    Continue with {{ provider.label }}
                </span>
            </button>

            <div
                v-if="providers.length === 0"
                class="flex flex-col items-center justify-center py-8 text-center"
            >
                <div class="mb-3 rounded-full bg-zinc-100 p-3 dark:bg-slate-700">
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-400 dark:text-slate-400" />
                </div>
                <p class="text-sm text-zinc-500 dark:text-slate-400">
                    No sign-in methods available.
                </p>
                <p class="mt-1 text-xs text-zinc-400 dark:text-slate-500">
                    Please contact support for assistance.
                </p>
            </div>
        </div>
    </LDialog>
</template>
