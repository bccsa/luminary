<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { purgeLocalDatabase } from "@/util/purgeLocalDatabase";
import { storeToRefs } from "pinia";

const { isConnected } = storeToRefs(useSocketConnectionStore());

const deleteLocalData = async () => {
    await purgeLocalDatabase();
    window.location.reload();
};
</script>

<template>
    <div>
        <h1 class="mb-4 text-xl font-medium">Settings</h1>

        <LCard title="Local cache">
            <div class="mb-4 text-sm text-zinc-600 dark:text-zinc-100">
                Most data is saved locally on your device. If you experience problems, try deleting
                all local data. Depending on the amount of available data on the server, it can take
                some time before all data is available again.
            </div>
            <LButton
                @click="deleteLocalData"
                data-test="deleteLocalDatabase"
                :disabled="!isConnected"
            >
                Delete local cache
            </LButton>
        </LCard>
    </div>
</template>
