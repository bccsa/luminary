<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
    buildTelegramShareUrl,
    buildWhatsAppShareUrl,
    buildXShareUrl,
    buildRedditShareUrl,
    formatShareMessage,
} from "@/composables/useSocialShare";
import type { ShareDraft } from "@/composables/useShare";
import { trackShare } from "@/analytics";
import TelegramIcon from "@/components/icons/TelegramIcon.vue";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon.vue";
import XIcon from "@/components/icons/XIcon.vue";
import RedditIcon from "@/components/icons/RedditIcon.vue";
import InstagramIcon from "@/components/icons/InstagramIcon.vue";
import { useNotificationStore } from "@/stores/notification";

/** The curated share targets, offered where the OS share sheet isn't. */
const props = defineProps<{ draft: ShareDraft }>();
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();

const message = (options: { withUrl?: boolean } = {}) =>
    formatShareMessage({
        quote: props.draft.quote,
        title: props.draft.title,
        copyright: props.draft.copyright,
        url: options.withUrl ? props.draft.url : undefined,
    });

function openTarget(method: string, url: string) {
    trackShare(method, props.draft);
    window.open(url, "_blank", "noopener,noreferrer");
    emit("done");
}

const shareToTelegram = () =>
    openTarget("telegram", buildTelegramShareUrl(message(), props.draft.url));

// The curated WhatsApp target still needs phone/tablet vs. desktop when there's no share sheet.
const shareToWhatsApp = () =>
    openTarget(
        "whatsapp",
        buildWhatsAppShareUrl(
            message({ withUrl: true }),
            window.matchMedia("(pointer: coarse)").matches,
        ),
    );

const shareToX = () => openTarget("x", buildXShareUrl(message(), props.draft.url));

const shareToReddit = () =>
    openTarget("reddit", buildRedditShareUrl(props.draft.title, props.draft.url));

// Instagram has no web share-URL API for posts/links, so the closest one-click equivalent
// is copying the text + link for the user to paste into a DM, Story or bio.
async function shareToInstagram() {
    try {
        await navigator.clipboard.writeText(message({ withUrl: true }));
    } catch (e) {
        console.error("Failed to copy share text to clipboard:", e);
        emit("done");
        return;
    }
    trackShare("instagram_copy", props.draft);
    useNotificationStore().addNotification({
        id: "share-link-copied",
        title: t("singlecontent.shareInstagramCopiedTitle"),
        description: t("singlecontent.shareInstagramCopiedDescription"),
        state: "success",
        type: "toast",
        timeout: 5000,
    });
    emit("done");
}

const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500";
</script>

<template>
    <div class="flex flex-col gap-0.5">
        <button type="button" @click="shareToTelegram" data-test="shareTelegram" :class="itemClass">
            <TelegramIcon class="size-4 flex-shrink-0" />
            <span class="min-w-0 truncate">{{ t("singlecontent.shareTelegram") }}</span>
        </button>
        <button type="button" @click="shareToWhatsApp" data-test="shareWhatsApp" :class="itemClass">
            <WhatsAppIcon class="size-4 flex-shrink-0" />
            <span class="min-w-0 truncate">{{ t("singlecontent.shareWhatsApp") }}</span>
        </button>
        <button type="button" @click="shareToX" data-test="shareX" :class="itemClass">
            <XIcon class="size-4 flex-shrink-0" />
            <span class="min-w-0 truncate">{{ t("singlecontent.shareX") }}</span>
        </button>
        <button type="button" @click="shareToReddit" data-test="shareReddit" :class="itemClass">
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
</template>
