<script setup lang="ts">
/**
 * A video hosted by YouTube, shown in the picture's place. Nothing is loaded from Google until the viewer
 * chooses: a poster and a notice stand there first, and Play (or an earlier "Always allow") adds the
 * iframe from YouTube's privacy-enhanced domain. Data Saver never plays by itself: the notice shows
 * whatever was allowed before.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { isDataSaverEnabled, userDataSaverEnabled, youtubeAlwaysAllow } from "@/globalConfig";
import { isNativeApp } from "@/util/inAppBrowser";
import { publicUrl } from "@/seo/publicSite";
import { youTubeEmbedUrl, youTubeIdOf, youTubeWatchUrl } from "@/util/youtube";

const props = defineProps<{ content: ContentDto; url: string }>();
const { t } = useI18n();

const id = computed(() => youTubeIdOf(props.url));
const dataSaver = computed(() => userDataSaverEnabled.value || isDataSaverEnabled());

/** Pressed Play on this video, in this view. */
const chosen = ref(false);
/** The box on the notice: remembered once Play is pressed. */
const remember = ref(false);

/**
 * What the frame shows. The packaged app's own pages have no address YouTube accepts (error 153), so there
 * the frame is a page on the web app's real HTTPS address, `youtube-embed.html`, which holds the embed.
 * Everywhere else, and where no web address is configured, it is the embed itself.
 */
const frameSrc = computed(() => {
    if (!id.value) return undefined;
    const hosted = isNativeApp() ? publicUrl(`/youtube-embed.html?v=${id.value}`) : undefined;
    return hosted ?? youTubeEmbedUrl(id.value);
});

const loaded = computed(
    () => !!id.value && (chosen.value || (youtubeAlwaysAllow.value && !dataSaver.value)),
);

function play() {
    if (remember.value) youtubeAlwaysAllow.value = true;
    chosen.value = true;
}
</script>

<template>
    <div
        class="relative aspect-video w-full overflow-hidden bg-black md:rounded-lg"
        data-test="youtubeEmbed"
    >
        <iframe
            v-if="loaded && frameSrc"
            :src="frameSrc"
            :title="content.title"
            class="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            data-test="youtubeFrame"
        />
        <template v-else>
            <LImage
                :image="content.parentImageData"
                aspectRatio="video"
                size="post"
                :content-parent-id="content.parentId"
                :parent-image-bucket-id="content.parentImageBucketId"
                class="absolute inset-0 h-full w-full object-cover opacity-50"
            />
            <div
                class="absolute inset-0 flex flex-col justify-center gap-2 p-4 text-white sm:p-6"
                data-test="youtubeNotice"
            >
                <p class="text-sm font-bold sm:text-base">{{ t("youtube.notice_title") }}</p>
                <p class="max-w-prose text-xs leading-snug text-white/90 sm:text-sm">
                    {{ t("youtube.notice_body") }}
                </p>
                <div class="mt-1 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        class="h-10 rounded-full bg-white px-5 text-sm font-semibold text-zinc-900"
                        data-test="youtubePlay"
                        @click="play"
                    >
                        {{ t("youtube.play") }}
                    </button>
                    <a
                        v-if="id"
                        :href="youTubeWatchUrl(id)"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex h-10 items-center rounded-full border border-white/60 px-4 text-sm font-medium text-white"
                        data-test="youtubeOpen"
                    >
                        {{ t("youtube.open") }}
                    </a>
                    <label class="flex items-center gap-2 text-xs text-white/90 sm:text-sm">
                        <input
                            v-model="remember"
                            type="checkbox"
                            class="h-4 w-4 accent-yellow-400"
                            data-test="youtubeRemember"
                        />
                        {{ t("youtube.always_allow") }}
                    </label>
                </div>
            </div>
        </template>
    </div>
</template>
