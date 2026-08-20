<script setup lang="ts">
import LModal from "@/components/form/LModal.vue";
import LImage from "@/components/images/LImage.vue";
import { EnvelopeIcon, ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
// The router singleton rather than useRouter(), so this modal keeps working
// wherever it is mounted without a router context.
import router from "@/router";
import { isKratosEnabled } from "@/auth/kratos/client";
import { useAuthCopy } from "@/components/auth/kratos/useAuthCopy";
import { showProviderSelectionModal, loginWithProvider } from "@/auth";
import { DocType, useHybridQuery, type AuthProviderDto } from "luminary-shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { resolveI18nEmbedded } from "@/util/resolveI18nEmbedded";

const { t } = useI18n();
const c = useAuthCopy();
// Only offered where the Kratos screens exist at all.
const kratosEnabled = isKratosEnabled();
const isVisible = defineModel<boolean>("isVisible");
// AuthProvider is a fully-synced type, so HybridQuery reads from IndexedDB only.
// Sorting by sortIndex (a non-content field) stays in a computed.
const allProviders = useHybridQuery<AuthProviderDto>(
    () => ({ selector: { type: DocType.AuthProvider } }),
    { live: true },
);

const providers = computed(() =>
    [...allProviders.value].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0)),
);
const resolveProviderLabel = (provider: AuthProviderDto) =>
    resolveI18nEmbedded(
        provider.label || provider.displayName || provider.domain || provider._id,
        t,
    );

const hasIcon = (provider: AuthProviderDto) =>
    provider.imageData?.fileCollections?.some((fc) => fc.imageFiles?.length > 0) ?? false;

const handleProviderSelect = (provider: AuthProviderDto) => {
    loginWithProvider(provider);
};

const handleClose = () => {
    showProviderSelectionModal.value = false;
};

/**
 * Kratos is not an OIDC provider, so it cannot be an AuthProvider doc and does
 * not go through loginWithProvider — it is its own route in this app.
 */
const handleGuestSelect = () => {
    handleClose();
    router.push({ path: "/auth/login", query: { return_to: router.currentRoute.value.fullPath } });
};
</script>

<template>
    <LModal
        :heading="t('auth.sign_in')"
        v-model:isVisible="isVisible"
        @close="handleClose"
    >
        <!-- Provider list -->
        <div class="flex flex-col gap-3 py-2">
            <button
                v-if="kratosEnabled"
                class="flex h-full w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-5 hover:bg-zinc-50 hover:shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600/60"
                @click="handleGuestSelect"
            >
                <div
                    class="flex size-9 shrink-0 items-center justify-center rounded-md bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                >
                    <EnvelopeIcon class="h-5 w-5" />
                </div>
                <span class="text-start text-[15px] font-medium text-zinc-700 dark:text-slate-200">
                    {{ c("auth.methods.guest_sign_in") }}
                </span>
            </button>

            <button
                v-for="provider in providers"
                :key="provider._id"
                class="group relative flex h-full w-full items-center gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-5 hover:shadow-sm dark:border-slate-600 dark:bg-slate-700"
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
                <div
                    v-if="hasIcon(provider)"
                    class="flex size-9 shrink-0 items-center justify-center gap-1"
                    :style="
                        provider.iconOpacity != null && provider.iconOpacity !== 1
                            ? { opacity: provider.iconOpacity }
                            : undefined
                    "
                >
                    <LImage
                        :image="provider.imageData"
                        :parentImageBucketId="provider.imageBucketId"
                        :contentParentId="provider._id"
                        size="icon"
                        :rounded="false"
                        class="h-5 w-5"
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
                    {{ resolveProviderLabel(provider) }}
                </span>
            </button>

            <div
                v-if="providers.length === 0 && !kratosEnabled"
                class="flex flex-col items-center justify-center py-8 text-center"
            >
                <div class="mb-3 rounded-full bg-zinc-100 p-3 dark:bg-slate-700">
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-400 dark:text-slate-400" />
                </div>
                <p class="text-sm text-zinc-500 dark:text-slate-400">
                    {{ t("auth.no_methods_available") }}
                </p>
            </div>
        </div>
    </LModal>
</template>
