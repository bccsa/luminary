<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { RouterLink } from "vue-router";
import { computed } from "vue";

const initialPage = import.meta.env.VITE_INITIAL_PAGE as string | undefined;
const mainPageRoute = computed(() =>
    initialPage && initialPage.trim() !== ""
        ? { path: initialPage.startsWith("/") ? initialPage : "/" + initialPage }
        : { name: "overview" as const, params: { docType: "post", tagOrPostType: "blog" } },
);
</script>

<template>
    <BasePage title="Dashboard" :should-show-page-title="false" is-full-width>
        <p class="p-3">
            It looks like the dashboard isn't ready yet.
            <RouterLink class="text-yellow-500" :to="mainPageRoute">
                Click here to return to the main page.
            </RouterLink>
        </p>
    </BasePage>
</template>
