<script setup lang="ts">
import LModal from "@/components/form/LModal.vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import { clearAuth0Cache, showProviderSelectionModal, loginWithProvider } from "@/auth";
import { db, DocType, mangoToDexie, useDexieLiveQuery, type OAuthProviderPublicDto } from "luminary-shared";
import { computed } from "vue";

const allProviders = useDexieLiveQuery(
    () => mangoToDexie<OAuthProviderPublicDto>(db.docs, { selector: { type: DocType.OAuthProvider } }),
    { initialValue: [] as OAuthProviderPublicDto[] },
);

const providers = computed(() =>
    (allProviders.value ?? []).filter((p) => !p.isGuestProvider),
);

const handleProviderSelect = async (provider: OAuthProviderPublicDto) => {
    clearAuth0Cache();
    await loginWithProvider(provider, { prompt: "login" });
};

const handleClose = () => {
    showProviderSelectionModal.value = false;
};
</script>

<template>
    <LModal
        heading="Sign in"
        v-model:isVisible="showProviderSelectionModal"
        @close="handleClose"
    >
        <!-- Provider list -->
        <div class="flex flex-col gap-3 py-2">
            <button
                v-for="provider in providers"
                :key="provider._id"
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
                        :style="{
                            opacity: provider.iconOpacity ?? 1,
                        }"
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
    </LModal>
</template>
