<script setup lang="ts">
import LModal from "@/components/form/LModal.vue";
import LImage from "@/components/images/LImage.vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import { showProviderSelectionModal, loginWithProvider } from "@/auth";
import {
    db,
    DocType,
    mangoToDexie,
    useDexieLiveQuery,
    type AuthProviderDto,
} from "luminary-shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const isVisible = defineModel<boolean>("isVisible");
const allProviders = useDexieLiveQuery(
    () => mangoToDexie<AuthProviderDto>(db.docs, { selector: { type: DocType.AuthProvider } }),
    { initialValue: [] as AuthProviderDto[] },
);

const providers = computed(() => allProviders.value ?? []);

const handleProviderSelect = (provider: AuthProviderDto) => {
    loginWithProvider(provider);
};

const handleClose = () => {
    showProviderSelectionModal.value = false;
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
                v-for="provider in providers"
                :key="provider._id"
                class="group relative flex h-full w-full items-center justify-start overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-5 hover:shadow-sm dark:border-slate-600 dark:bg-slate-700"
                :class="{ 'pl-12': provider.imageData }"
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
                    v-if="provider.imageData"
                    class="absolute left-4 flex shrink-0 items-center justify-center"
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
                        size="smallSquare"
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
                    {{ provider.label }}
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
                    {{ t("auth.no_methods_available") }}
                </p>
                <p class="mt-1 text-xs text-zinc-400 dark:text-slate-500">
                    {{ t("auth.contact_support") }}
                </p>
            </div>
        </div>
    </LModal>
</template>
