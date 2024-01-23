<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import BasePage from "@/components/BasePage.vue";
import { onMounted, ref } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";

const { getAccessTokenSilently } = useAuth0();
const { apiUrl } = useGlobalConfigStore();

const apiResult = ref("Loading...");

onMounted(async () => {
    // Example on how to authenticate with the API using an Auth0 access token
    // This would normally be abstracted away in a store, and perhaps a generic api request class
    const token = await getAccessTokenSilently();
    const response = await fetch(`${apiUrl}/protected`, {
        headers: {
            Authorization: "Bearer " + token,
        },
    });
    apiResult.value = await response.text();
});
</script>

<template>
    <BasePage title="API example">
        <p>Response: {{ apiResult }}</p>
    </BasePage>
</template>
