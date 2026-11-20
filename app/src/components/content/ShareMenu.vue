<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ShareIcon } from "@heroicons/vue/24/outline";
import type { ContentDto } from "luminary-shared";
import { useI18n } from "vue-i18n";
import DropdownMenu from "@/components/common/DropdownMenu.vue";
import ShareTargets from "@/components/content/ShareTargets.vue";
import {
    articleShareUrl,
    firstParagraphExcerpt,
    fetchShareImageFile,
    shareImageUrl,
} from "@/composables/useSocialShare";
import { useShare, type ShareDraft } from "@/composables/useShare";
import { useBucketInfo } from "@/composables/useBucketInfo";
import { dataSaverOn } from "@/globalConfig";
import { isSlowConnection } from "@/composables/useNetworkSpeedEstimator";

const props = defineProps<{
    content: ContentDto;
    /** The resolved copyright to attribute: the post's own, else the instance-wide notice. */
    copyright?: string;
}>();

const { t } = useI18n();
const open = ref(false);
const { nativeShareAvailable, shareNatively, canShareFiles } = useShare();

const draft = (): ShareDraft => ({
    quote: firstParagraphExcerpt(props.content.text) || props.content.summary,
    title: props.content.title,
    copyright: props.copyright || props.content.copyright,
    url: articleShareUrl(props.content.slug),
});

const { bucketBaseUrl } = useBucketInfo(computed(() => props.content.parentImageBucketId));

// Instagram (and the other image-only apps) only offer themselves as share targets when the
// share carries a file, so the article image is attached wherever the platform accepts one.
// iOS drops the user activation across an `await`, so the file has to be in hand before the
// tap: fetch it as soon as the share sheet is known to be this device's path (the bucket URL
// arrives asynchronously, hence the watch) and hand the sheet whatever is ready.
const shareFiles = ref<File[]>();
let preparedUrl: string | undefined;

async function prepareShareImage(url: string) {
    const file = await fetchShareImageFile(url);
    if (file && canShareFiles([file])) shareFiles.value = [file];
}

// A reader who has asked for less data (or is on a slow link) gets the text-only share the
// curated targets already send; the link preview still carries the image.
const mayPrefetchImage = () => !isSlowConnection.value && !dataSaverOn.value;

watch(
    () =>
        nativeShareAvailable.value && mayPrefetchImage()
            ? shareImageUrl(props.content, bucketBaseUrl.value)
            : undefined,
    (url) => {
        if (!url || url === preparedUrl) return;
        preparedUrl = url;
        prepareShareImage(url);
    },
    { immediate: true },
);

async function share() {
    if (!(await shareNatively(draft(), shareFiles.value))) open.value = true;
}

const triggerClass =
    "flex items-center text-zinc-400 transition-colors hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-200";
</script>

<template>
    <button
        v-if="nativeShareAvailable"
        type="button"
        :aria-label="t('singlecontent.share')"
        data-test="shareMenuTrigger"
        :class="triggerClass"
        @click="share"
    >
        <ShareIcon class="h-5 w-5" />
    </button>

    <DropdownMenu
        v-else
        v-model:open="open"
        placement="top-start"
        panel-class="w-60 rounded-lg bg-white p-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-menu-dark dark:ring-slate-500"
    >
        <template #trigger>
            <span
                :aria-label="t('singlecontent.share')"
                data-test="shareMenuTrigger"
                :class="triggerClass"
            >
                <ShareIcon class="h-5 w-5" />
            </span>
        </template>

        <template #default="{ triggerOffsetX = 0, above = true }">
            <ShareTargets :draft="draft()" @done="open = false" />

            <!-- Arrow, matching the highlight-selection popup's pointer. It tracks the
                 trigger rather than the panel edge, so it still points at the share button
                 when the panel has been clamped to the viewport. -->
            <div
                class="absolute h-3 w-3 -rotate-45 border-zinc-200 bg-white dark:border-slate-500 dark:bg-menu-dark"
                :class="above ? '-bottom-1.5 border-b border-l' : '-top-1.5 border-r border-t'"
                :style="{ left: `${triggerOffsetX - 6}px` }"
            ></div>
        </template>
    </DropdownMenu>
</template>
