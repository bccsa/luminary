<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getAvailableProviders, clearAuth0Cache } from "@/auth";
import type { OAuthProviderPublicDto } from "luminary-shared";
import LButton from "@/components/button/LButton.vue";

const providers = ref<OAuthProviderPublicDto[]>([]);
const isLoading = ref(true);

const handleProviderSelect = async (provider: OAuthProviderPublicDto) => {
    // Clear old auth data (cache, etc.)
    clearAuth0Cache();
    // Redirect to the same page with the selected provider ID
    // This will trigger the auth plugin to re-initialize with the correct config
    // and then automatically redirect to the login page
    window.location.href = `/?providerId=${provider.id}`;
};

onMounted(async () => {
    providers.value = await getAvailableProviders();
    isLoading.value = false;

    // If only one provider, select it and go (unless we want to verify user intent?)
    // For now, let's keep the list if they landed here, implying they might want to switch or we are forcing a choice.
    // But if we want to be smart:
    if (providers.value.length === 1) {
        // handleProviderSelect(providers.value[0]);
    }
});
</script>

<template>
    <div
        class="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8"
    >
        <div class="w-full max-w-md space-y-8">
            <div>
                <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
                    Sign in to your account
                </h2>
                <p class="mt-2 text-center text-sm text-gray-600">
                    Select an authentication provider to continue
                </p>
            </div>

            <div v-if="isLoading" class="flex justify-center">
                <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
            </div>

            <div v-else class="mt-8 space-y-4">
                <div
                    class="flex w-full justify-between rounded-lg bg-zinc-200/60 p-2"
                    v-for="provider in providers"
                    :key="provider.id"
                >
                    <LButton
                        :icon="provider.icon"
                        variant="tertiary"
                        size="xl"
                        class="ga h-16 w-full justify-center [&_img]:h-10 [&_img]:w-10"
                        @click="handleProviderSelect(provider)"
                    >
                        {{ provider.label }}
                    </LButton>
                </div>

                <div v-if="providers.length === 0" class="text-center text-sm text-gray-500">
                    No providers configured. Please contact support.
                </div>
            </div>
        </div>
    </div>
</template>
