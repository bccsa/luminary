<script setup lang="ts">
import LModal from "../modals/LModal.vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import { loginWithProvider } from "@/auth";
import {
    db,
    DocType,
    mangoToDexie,
    useDexieLiveQuery,
    type AuthProviderDto,
} from "luminary-shared";
import { computed } from "vue";
import { storageSelection } from "@/composables/storageSelection";

const isVisible = defineModel<boolean>("isVisible");
const storage = storageSelection();

const allProviders = useDexieLiveQuery(
    async () => {
        const list = await mangoToDexie<AuthProviderDto>(db.docs, {
            selector: { type: DocType.AuthProvider },
        });
        return list.sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    },
    { initialValue: [] as AuthProviderDto[] },
);

const providers = computed(() => allProviders.value ?? []);

const hasIcon = (provider: AuthProviderDto) =>
    provider.imageData?.fileCollections?.some((fc) => fc.imageFiles?.length > 0) ?? false;

const getIconUrl = (provider: AuthProviderDto): string | undefined => {
    if (provider.icon) return provider.icon;
    const file = provider.imageData?.fileCollections?.[0]?.imageFiles?.[0];
    if (!file || !provider.imageBucketId) return undefined;
    const bucket = storage.getBucketById(provider.imageBucketId);
    if (!bucket) return undefined;
    return `${bucket.publicUrl}/${file.filename}`;
};

const handleProviderSelect = (provider: AuthProviderDto) => {
    loginWithProvider(provider);
};
</script>

<template>
    <LModal heading="Sign in" v-model:isVisible="isVisible" :showClosingButton="false">
        <div class="flex flex-col gap-3 py-2">
            <button
                v-for="provider in providers"
                :key="provider._id"
                class="group relative flex h-full w-full items-center gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-5 hover:shadow-sm"
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
                    <img
                        v-if="getIconUrl(provider)"
                        :src="getIconUrl(provider)"
                        :alt="provider.label"
                        class="h-5 w-5 object-contain"
                    />
                </div>
                <span
                    class="text-start text-[15px] font-medium text-zinc-700 group-hover:text-zinc-900"
                    :style="provider.textColor ? { color: provider.textColor } : {}"
                >
                    {{ provider.label }}
                </span>
            </button>

            <div
                v-if="providers.length === 0"
                class="flex flex-col items-center justify-center py-8 text-center"
            >
                <div class="mb-3 rounded-full bg-zinc-100 p-3">
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-400" />
                </div>
                <p class="text-sm text-zinc-500">No sign-in methods available.</p>
            </div>
        </div>
    </LModal>
</template>
