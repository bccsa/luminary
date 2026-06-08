<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import BasePage from "@/components/BasePage.vue";
import ContinueProgress from "@/components/HomePage/ContinueProgress.vue";
import ContinueListening from "@/components/HomePage/ContinueListening.vue";
import HomePageSearch from "@/components/HomePage/HomePageSearch.vue";
import { isMdScreen } from "@/globalConfig";
import { computed, nextTick, onActivated, onMounted, ref } from "vue";
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

// The home feed sections are query-driven (Dexie) — prerendering them is Phase 2
// (needs the hybrid Mango query). On the web/SSG build they would crash in Node
// (no Dexie), so render them only after mount; the prerendered home is a clean
// shell (header/nav + SEO). On native they render immediately (unchanged).
const isWeb = import.meta.env.VITE_BUILD_TARGET === "web";
const isMounted = ref(false);
onMounted(() => {
    isMounted.value = true;
});
const showDynamic = computed(() => !isWeb || isMounted.value);
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <template v-if="showDynamic">
                <HomePageSearch v-if="isMdScreen" />
                <Suspense @resolve="pinnedResolved = true; checkReady()">
                    <HomePagePinned />
                </Suspense>
                <Suspense @resolve="newestResolved = true; checkReady()">
                    <HomePageNewest />
                </Suspense>

                <ContinueProgress />
                <ContinueListening />
            </template>
        </IgnorePagePadding>
    </BasePage>
</template>
