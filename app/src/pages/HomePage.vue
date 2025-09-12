<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import BasePage from "@/components/BasePage.vue";
import ContinueWatching from "@/components/HomePage/ContinueWatching.vue";
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <Suspense>
                <HomePagePinned />
            </Suspense>
            <Suspense>
                <HomePageNewest />
            </Suspense>

            <ContinueWatching />
        </IgnorePagePadding>
    </BasePage>
</template>
