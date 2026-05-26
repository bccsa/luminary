<script setup lang="ts">
import PinnedVideo from "@/components/VideoPage/PinnedVideo.vue";
import UnpinnedVideo from "@/components/VideoPage/UnpinnedVideo.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import BasePage from "@/components/BasePage.vue";
import { nextTick, onActivated, ref } from "vue";
import { markPageReady } from "@/util/renderState";

const pinnedResolved = ref(false);
const unpinnedResolved = ref(false);

async function checkReady() {
    if (pinnedResolved.value && unpinnedResolved.value) {
        await nextTick();
        markPageReady();
    }
}

onActivated(checkReady);
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <Suspense @resolve="pinnedResolved = true; checkReady()">
                <PinnedVideo />
            </Suspense>
            <Suspense @resolve="unpinnedResolved = true; checkReady()">
                <UnpinnedVideo />
            </Suspense>
        </IgnorePagePadding>
    </BasePage>
</template>
