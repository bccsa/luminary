<script setup lang="ts">
import { computed, ref } from "vue";
import { ShareIcon } from "@heroicons/vue/24/outline";
import type { ContentDto } from "luminary-shared";
import { useI18n } from "vue-i18n";
import DropdownMenu from "@/components/common/DropdownMenu.vue";
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

const EXCERPT_MAX_LENGTH = 180;

// Plain-text excerpt of the article's first paragraph, trimmed to a whole word and
// marked with an ellipsis when cut short — gives shared text a preview of the body,
// not just the title/summary. Runs client-side only (a click handler), so parsing the
// CMS-authored HTML into a detached, never-attached element is safe: it's never
// inserted into the document, so nothing in it can execute.
function firstParagraphExcerpt(html: string | undefined): string {
    if (!html) return "";
    const container = document.createElement("div");
    container.innerHTML = html;
    const text = (container.querySelector("p")?.textContent ?? container.textContent ?? "")
        .trim()
        .replace(/\s+/g, " ");
    if (!text) return "";
    if (text.length <= EXCERPT_MAX_LENGTH) return text;
    const truncated = text.slice(0, EXCERPT_MAX_LENGTH);
    const lastSpace = truncated.lastIndexOf(" ");
    return `${truncated.slice(0, lastSpace > 0 ? lastSpace : EXCERPT_MAX_LENGTH)}…`;
}

// Title, summary, a body excerpt and copyright together, in that order — each only when present.
const shareText = computed(() =>
    [
        props.content.title,
        props.content.summary,
        firstParagraphExcerpt(props.content.text),
        props.content.copyright,
    ]
        .filter(Boolean)
        .join("\n\n"),
);

const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500";

function shareToTelegram() {
    const url = new URL("https://t.me/share/url");
    url.searchParams.set("url", shareUrl());
    url.searchParams.set("text", shareText.value);
    window.open(url.toString(), "_blank");
    open.value = false;
}

function shareToWhatsApp() {
    // web.whatsapp.com, not wa.me / api.whatsapp.com — both of those are registered as
    // OS-level Universal Links, so the click is handed straight to the native desktop
    // app before the page (or the `text` param) is involved, and the app's own handler
    // drops everything but the trailing URL. web.whatsapp.com isn't a Universal Link
    // target, so it opens as a normal page and keeps the full pre-filled text intact.
    const url = new URL("https://web.whatsapp.com/send");
    url.searchParams.set("text", `${shareText.value}\n\n${shareUrl()}`);
    window.open(url.toString(), "_blank");
    open.value = false;
}

function shareToX() {
    const url = new URL("https://twitter.com/intent/tweet");
    url.searchParams.set("text", shareText.value);
    url.searchParams.set("url", shareUrl());
    window.open(url.toString(), "_blank");
    open.value = false;
}

function shareToReddit() {
    // Reddit's link-submit intent only takes a title, not a body — passing summary/copyright
    // here would submit a text post instead of sharing the link.
    const url = new URL("https://www.reddit.com/submit");
    url.searchParams.set("url", shareUrl());
    url.searchParams.set("title", props.content.title);
    window.open(url.toString(), "_blank");
    open.value = false;
}

// Instagram has no web share-URL API for posts/links, so the closest one-click equivalent
// is copying the text + link for the user to paste into a DM, Story or bio.
async function shareToInstagram() {
    await navigator.clipboard.writeText(`${shareText.value}\n\n${shareUrl()}`);
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
    <DropdownMenu
        v-model:open="open"
        placement="top-start"
        panel-class="w-60 rounded-lg bg-white p-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-slate-700 dark:ring-slate-500"
    >
        <template #trigger>
            <span
                :aria-label="t('singlecontent.share')"
                data-test="shareMenuTrigger"
                class="flex items-center text-zinc-400 transition-colors hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-200"
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
