<script setup lang="ts">
import SearchPanel from "@/components/search/SearchPanel.vue";
import BasePage from "@/components/BasePage.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { nextTick, onMounted } from "vue";
import { markPageReady } from "@/util/renderState";
import { useLocalizedStaticHead } from "@/seo/contentHead";

// The dedicated public search page. The same SearchPanel the desktop modal embeds is used
// here in `page` mode, so the page and the overlay can't diverge. On mobile this is the
// search destination (the bottom-menu search button routes here); on desktop there is no nav
// link to it, but the URL is valid and is what the JSON-LD SearchAction targets.
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
