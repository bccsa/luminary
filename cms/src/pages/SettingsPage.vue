<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { useNotificationStore } from "@/stores/notification";
import { triggerSync } from "@/sync";
import { Cog6ToothIcon } from "@heroicons/vue/20/solid";
import { db, getRest, isConnected } from "luminary-shared";

const { addNotification } = useNotificationStore();

const deleteLocalData = async () => {
    if (!isConnected.value) {
        return addNotification({
            title: "Can't clear local cache",
            description: "You are offline, new data can't be loaded. Wait until you are online.",
            state: "error",
        });
    }

    await db.purge();
    triggerSync();

    return addNotification({
        title: "Local cache cleared",
        description: "New data is loading from the server, it might take a minute.",
        state: "success",
    });
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
            <LButton @click="deleteLocalData" data-test="deleteLocalDatabase">
                Delete local cache
            </LButton>
        </LCard>
    </BasePage>
</template>
