<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { RouterLink } from "vue-router";
const initialPage = import.meta.env.VITE_INITIAL_PAGE;
</script>

<template>
    <BasePage title="Dashboard" :should-show-page-title="false" is-full-width>
        <p>
            It looks like the dashboard isn't ready yet.
            <RouterLink
                class="text-yellow-500"
                :to="
                    initialPage
                        ? { path: initialPage }
                        : { name: 'overview', params: { docType: 'post', tagOrPostType: 'blog' } }
                "
            >
                Click here to return to the main page.
            </RouterLink>
        </p>
    </BasePage>
</template>
