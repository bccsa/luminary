<script setup lang="ts">
import { ref, watch } from "vue";
import ProviderSelectionModal from "@/components/navigation/ProviderSelectionModal.vue";
import { appName, logo } from "@/globalConfig";
import LoadingBar from "@/components/LoadingBar.vue";

const showModal = ref(true);
watch(showModal, (open) => {
    if (!open) showModal.value = true;
});
</script>

<template>
    <div class="absolute flex h-full w-full items-center justify-center">
        <div class="flex flex-col items-center gap-4">
            <img
                v-if="logo"
                class="h-auto w-72 max-w-[18rem]"
                :src="logo"
                :alt="appName"
            />
            <div class="flex items-center gap-2 text-lg">
                <LoadingBar />
            </div>
            <p class="text-sm text-zinc-500">Select a sign-in provider to continue</p>
        </div>
    </div>
    <ProviderSelectionModal v-model:open="showModal" />
</template>
