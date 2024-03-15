<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { purgeLocalDatabase } from "@/util/purgeLocalDatabase";
import { Cog6ToothIcon } from "@heroicons/vue/20/solid";
import { storeToRefs } from "pinia";

const { isConnected } = storeToRefs(useSocketConnectionStore());

const deleteLocalData = async () => {
    await purgeLocalDatabase();
    window.location.reload();
};
</script>

<template>
    <BasePage title="Settings" :icon="Cog6ToothIcon">
        <LCard title="Local cache">
            <div class="mb-4 text-sm text-zinc-600">
                All CMS data is saved locally on your device. If you experience problems, try
                deleting all local data. Depending on the amount of available data, it can take some
                time before all data is available again.
            </div>
            <LButton
                @click="deleteLocalData"
                data-test="deleteLocalDatabase"
                :disabled="!isConnected"
            >
                Delete local cache
            </LButton>
        </LCard>
    </BasePage>
</template>
