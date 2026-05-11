<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import HomePageSearch from "@/components/HomePage/HomePageSearch.vue";
import BasePage from "@/components/BasePage.vue";
import ContinueWatching from "@/components/HomePage/ContinueWatching.vue";
import ContinueListening from "@/components/HomePage/ContinueListening.vue";
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <HomePageSearch />
            <Suspense>
                <HomePagePinned />
            </Suspense>
            <Suspense>
                <HomePageNewest />
            </Suspense>

            <ContinueWatching />
            <ContinueListening />
        </IgnorePagePadding>
    </BasePage>
</template>
