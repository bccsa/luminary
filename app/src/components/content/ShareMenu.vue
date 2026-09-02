<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ShareIcon } from "@heroicons/vue/24/outline";
import type { ContentDto } from "luminary-shared";
import { useI18n } from "vue-i18n";
import DropdownMenu from "@/components/common/DropdownMenu.vue";
import {
    buildTelegramShareUrl,
    buildWhatsAppShareUrl,
    buildXShareUrl,
    buildRedditShareUrl,
    firstParagraphExcerpt,
    formatShareMessage,
} from "@/composables/useSocialShare";
import TelegramIcon from "@/components/icons/TelegramIcon.vue";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon.vue";
import XIcon from "@/components/icons/XIcon.vue";
import RedditIcon from "@/components/icons/RedditIcon.vue";
import InstagramIcon from "@/components/icons/InstagramIcon.vue";
import { useNotificationStore } from "@/stores/notification";

const props = defineProps<{ content: ContentDto }>();

const { t } = useI18n();
const open = ref(false);

// `window.location.href` (not a build-time canonical URL) so the shared link is always
// the URL actually open in the browser — this only ever runs client-side, after a click.
const shareUrl = () => window.location.href;

const shareMessage = (options: { withUrl?: boolean } = {}) =>
    formatShareMessage({
        quote: firstParagraphExcerpt(props.content.text) || props.content.summary,
        title: props.content.title,
        copyright: props.content.copyright,
        url: options.withUrl ? shareUrl() : undefined,
    });

// Only phones/tablets (coarse pointer) get the OS share sheet: there it opens the
// messaging apps the reader actually has, while a desktop sheet mostly re-lists web
// targets the curated menu already covers. Resolved after mount, not at setup: the
// prerendered HTML has no `navigator`, and rendering the menu on both sides keeps
// hydration matched.
const nativeShareAvailable = ref(false);
onMounted(() => {
    nativeShareAvailable.value =
        typeof navigator?.share === "function" && window.matchMedia("(pointer: coarse)").matches;
});

// Prefer the share sheet where it's available, with the curated targets as the fallback.
async function shareNatively() {
    try {
        await navigator.share({
            title: props.content.title,
            text: shareMessage(),
            url: shareUrl(),
        });
    } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return; // reader dismissed the sheet
        // Web Share can be present but blocked (e.g. an iframe without the web-share
        // permission) — drop to the curated targets for the rest of this page view.
        nativeShareAvailable.value = false;
        open.value = true;
    }
}

const triggerClass =
    "flex items-center text-zinc-400 transition-colors hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-200";

const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500";

function shareToTelegram() {
    window.open(buildTelegramShareUrl(shareMessage(), shareUrl()), "_blank");
    open.value = false;
}

function shareToWhatsApp() {
    window.open(buildWhatsAppShareUrl(shareMessage({ withUrl: true })), "_blank");
    open.value = false;
}

function shareToX() {
    window.open(buildXShareUrl(shareMessage(), shareUrl()), "_blank");
    open.value = false;
}

function shareToReddit() {
    window.open(buildRedditShareUrl(props.content.title, shareUrl()), "_blank");
    open.value = false;
}

// Instagram has no web share-URL API for posts/links, so the closest one-click equivalent
// is copying the text + link for the user to paste into a DM, Story or bio.
async function shareToInstagram() {
    await navigator.clipboard.writeText(shareMessage({ withUrl: true }));
    useNotificationStore().addNotification({
        id: "share-link-copied",
        title: t("singlecontent.shareInstagramCopiedTitle"),
        description: t("singlecontent.shareInstagramCopiedDescription"),
        state: "success",
        type: "toast",
        timeout: 5000,
    });
    open.value = false;
}
</script>

<template>
    <button
        v-if="nativeShareAvailable"
        type="button"
        :aria-label="t('singlecontent.share')"
        data-test="shareMenuTrigger"
        :class="triggerClass"
        @click="shareNatively"
    >
        <ShareIcon class="h-5 w-5" />
    </button>

    <DropdownMenu
        v-else
        v-model:open="open"
        placement="top-start"
        panel-class="w-60 rounded-lg bg-white p-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-slate-700 dark:ring-slate-500"
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

        <div class="flex flex-col gap-0.5">
            <button
                type="button"
                @click="shareToTelegram"
                data-test="shareTelegram"
                :class="itemClass"
            >
                <TelegramIcon class="size-4 flex-shrink-0" />
                <span class="min-w-0 truncate">{{ t("singlecontent.shareTelegram") }}</span>
            </button>
            <button
                type="button"
                @click="shareToWhatsApp"
                data-test="shareWhatsApp"
                :class="itemClass"
            >
                <WhatsAppIcon class="size-4 flex-shrink-0" />
                <span class="min-w-0 truncate">{{ t("singlecontent.shareWhatsApp") }}</span>
            </button>
            <button
                type="button"
                @click="shareToX"
                data-test="shareX"
                :class="itemClass"
            >
                <XIcon class="size-4 flex-shrink-0" />
                <span class="min-w-0 truncate">{{ t("singlecontent.shareX") }}</span>
            </button>
            <button
                type="button"
                @click="shareToReddit"
                data-test="shareReddit"
                :class="itemClass"
            >
                <RedditIcon class="size-4 flex-shrink-0" />
                <span class="min-w-0 truncate">{{ t("singlecontent.shareReddit") }}</span>
            </button>
            <button
                type="button"
                @click="shareToInstagram"
                data-test="shareInstagram"
                :class="itemClass"
            >
                <InstagramIcon class="size-4 flex-shrink-0" />
                <span class="min-w-0 truncate">{{ t("singlecontent.shareInstagram") }}</span>
            </button>
        </div>

        <!-- Arrow, matching the highlight-selection popup's pointer -->
        <div
            class="absolute -bottom-1.5 left-4 h-3 w-3 -rotate-45 border-b border-l border-zinc-200 bg-white dark:border-slate-500 dark:bg-slate-700"
        ></div>
    </DropdownMenu>
</template>
