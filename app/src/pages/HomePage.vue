<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import BasePage from "@/components/BasePage.vue";
import ContinueProgress from "@/components/HomePage/ContinueProgress.vue";
import ContinueListening from "@/components/HomePage/ContinueListening.vue";
import HomePageSearch from "@/components/HomePage/HomePageSearch.vue";
import { isMdScreen } from "@/globalConfig";
import { nextTick, onActivated, ref } from "vue";
import { markPageReady } from "@/util/renderState";
import { useLocalizedStaticHead } from "@/seo/contentHead";

const pinnedResolved = ref(false);
const newestResolved = ref(false);

async function checkReady() {
    if (pinnedResolved.value && newestResolved.value) {
        await nextTick();
        markPageReady();
    }
}

onActivated(checkReady);
useLocalizedStaticHead("/");

// The home feed sections now prerender on the web build (their useContentQuery is
// SSG-aware — fetches via the public API at build, seeds + hydrates cleanly). No
// build-time gating needed; native is unchanged.
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <HomePageSearch v-if="isMdScreen" />
            <Suspense
                @resolve="
                    pinnedResolved = true;
                    checkReady();
                "
            >
                <HomePagePinned />
            </Suspense>
            <Suspense
                @resolve="
                    newestResolved = true;
                    checkReady();
                "
            >
                <HomePageNewest />
            </Suspense>

            <ContinueProgress />
            <ContinueListening />
        </IgnorePagePadding>
    </BasePage>
</template>
