<script setup lang="ts">
import PinnedVideo from "@/components/VideoPage/PinnedVideo.vue";
import UnpinnedVideo from "@/components/VideoPage/UnpinnedVideo.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import BasePage from "@/components/BasePage.vue";
import { computed, nextTick, onActivated, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { markPageReady } from "@/util/renderState";
import { useLocalizedStaticHead } from "@/seo/contentHead";
import { useDownloads } from "@/build-time/contracts/downloads/token";

const { t } = useI18n();
const downloads = useDownloads();

const pinnedResolved = ref(false);
const unpinnedResolved = ref(false);

async function checkReady() {
    if (pinnedResolved.value && unpinnedResolved.value) {
        await nextTick();
        markPageReady();
    }
}

onActivated(checkReady);
useLocalizedStaticHead("/watch");

// Follows the device's connection (downloaded only while offline) until the viewer picks.
const pickedDownloadedOnly = ref<boolean>();
const downloadedOnly = computed({
    get: () =>
        !!downloads.value && (pickedDownloadedOnly.value ?? !downloads.value.network.value.online),
    set: (value: boolean) => (pickedDownloadedOnly.value = value),
});
// Going offline again shows what can play, whatever was picked while online.
watch(
    () => downloads.value?.network.value.online,
    (online) => {
        if (online === false) pickedDownloadedOnly.value = undefined;
    },
);

const playableParentIds = computed(() =>
    downloadedOnly.value && downloads.value
        ? [...downloads.value.playableParentIds.value]
        : undefined,
);
const listKey = computed(() => (downloadedOnly.value ? "downloaded" : "all"));
const showNoDownloads = computed(
    () => downloadedOnly.value && playableParentIds.value?.length === 0,
);
</script>

<template>
    <BasePage>
        <IgnorePagePadding ignoreTop>
            <div v-if="downloads" class="flex justify-end px-4 pt-3">
                <component :is="downloads.ui.WatchFilterSwitch" v-model="downloadedOnly" />
            </div>
            <p
                v-if="showNoDownloads"
                class="px-4 py-8 text-center text-sm text-zinc-500 dark:text-slate-400"
                data-test="watch-no-downloads"
            >
                {{ t("downloads.watch_filter.empty") }}
            </p>
            <Suspense
                @resolve="
                    pinnedResolved = true;
                    checkReady();
                "
            >
                <PinnedVideo :key="listKey" :parentIds="playableParentIds" />
            </Suspense>
            <Suspense
                @resolve="
                    unpinnedResolved = true;
                    checkReady();
                "
            >
                <UnpinnedVideo :key="listKey" :parentIds="playableParentIds" />
            </Suspense>
        </IgnorePagePadding>
    </BasePage>
</template>
