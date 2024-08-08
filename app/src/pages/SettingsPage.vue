<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { db, getSocket, isConnected } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";

const { addNotification } = useNotificationStore();

const deleteLocalData = async () => {
    if (!isConnected.value) {
        return addNotification({
            title: "Can't clear local cache",
            description: "You are offline, new data can't be loaded. Wait until you are online.",
            state: "error",
            type: "toast",
        });
    }

    await db.purge();
    getSocket().requestData();

    return addNotification({
        title: "Local cache cleared",
        description: "New data is loading from the server, it might take a minute.",
        state: "success",
        type: "toast",
    });
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
            <LButton @click="deleteLocalData" data-test="deleteLocalDatabase">
                Delete local cache
            </LButton>
        </LCard>
    </div>
</template>
