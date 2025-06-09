<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import BasePage from "@/components/BasePage.vue";
import ContinueWatching from "@/components/HomePage/ContinueWatching.vue";
import ContinueListening from "@/components/HomePage/ContinueListening.vue";
import ContinueReading from "@/components/HomePage/ContinueReading.vue";
import HomePageSearch from "@/components/HomePage/HomePageSearch.vue";
import { isMdScreen } from "@/globalConfig";
import { nextTick, onActivated, ref } from "vue";
import { markPageReady } from "@/util/renderState";

const pinnedResolved = ref(false);
const newestResolved = ref(false);

async function checkReady() {
    if (pinnedResolved.value && newestResolved.value) {
        await nextTick();
        markPageReady();
    }
}

onActivated(checkReady);
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <HomePageSearch v-if="isMdScreen" />
            <Suspense @resolve="pinnedResolved = true; checkReady()">
                <HomePagePinned />
            </Suspense>
            <Suspense @resolve="newestResolved = true; checkReady()">
                <HomePageNewest />
            </Suspense>

            <ContinueWatching />
            <ContinueListening />
            <ContinueReading />
        </IgnorePagePadding>
    </BasePage>
</template>
