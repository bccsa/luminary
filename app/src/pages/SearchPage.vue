<script setup lang="ts">
import SearchPanel from "@/components/search/SearchPanel.vue";
import BasePage from "@/components/BasePage.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { nextTick, onMounted } from "vue";
import { markPageReady } from "@/util/renderState";
import { useLocalizedStaticHead } from "@/seo/contentHead";

// The dedicated public search page, reusing SearchPanel in `page` mode so the page and the modal overlay can't diverge. The URL is the JSON-LD SearchAction target and the mobile search destination.
onMounted(async () => {
    // No async data is fetched at prerender time (the bare /search page renders the empty
    // state), so the page is ready as soon as it mounts.
    await nextTick();
    markPageReady();
});

useLocalizedStaticHead("/search");
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <SearchPanel mode="page" />
        </IgnorePagePadding>
    </BasePage>
</template>
