<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import BasePage from "@/components/BasePage.vue";
import ContinueProgress from "@/components/HomePage/ContinueProgress.vue";
import ContinueListening from "@/components/HomePage/ContinueListening.vue";
import RecommendedForYou from "@/components/HomePage/RecommendedForYou.vue";
import HomePageSearch from "@/components/HomePage/HomePageSearch.vue";
import { isMdScreen } from "@/globalConfig";
import { nextTick, onActivated, ref } from "vue";
import { markPageReady } from "@/util/renderState";

// Feature flag: recommendations stay hidden until enabled via env (unfinished work
// behind a flag, not a long-lived branch). The component also self-hides on a cold
// profile, so turning it on is safe.
const recommendationsEnabled = import.meta.env.VITE_ENABLE_RECOMMENDATIONS === "true";

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

            <RecommendedForYou v-if="recommendationsEnabled" />
            <ContinueProgress />
            <ContinueListening />
        </IgnorePagePadding>
    </BasePage>
</template>
