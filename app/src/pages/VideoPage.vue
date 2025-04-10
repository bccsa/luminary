<script setup lang="ts">
import PinnedVideo from "@/components/VideoPage/PinnedVideo.vue";
import UnpinnedVideo from "@/components/VideoPage/UnpinnedVideo.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import BasePage from "@/components/BasePage.vue";
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <Suspense>
                <PinnedVideo />
            </Suspense>
            <Suspense>
                <UnpinnedVideo />
            </Suspense>
        </IgnorePagePadding>
    </BasePage>
</template>
