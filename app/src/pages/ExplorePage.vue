<script setup lang="ts">
import UnpinnedTopics from "@/components/ExplorePage/UnpinnedTopics.vue";
import PinnedTopics from "@/components/ExplorePage/PinnedTopics.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import BasePage from "@/components/BasePage.vue";
import { nextTick, onActivated, ref } from "vue";
import { markPageReady } from "@/util/ssgRenderState";

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
                <PinnedTopics />
            </Suspense>
            <Suspense @resolve="unpinnedResolved = true; checkReady()">
                <UnpinnedTopics />
            </Suspense>
        </IgnorePagePadding>
    </BasePage>
</template>
