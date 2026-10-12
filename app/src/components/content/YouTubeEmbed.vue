<script setup lang="ts">
/**
 * A video hosted by YouTube, shown in the picture's place. Nothing is loaded from Google until the viewer
 * chooses: a poster and a notice stand there first, and Play (or an earlier "Always allow") adds the
 * frame. Data Saver never plays by itself: the notice shows whatever was allowed before.
 *
 * The frame is `youtube-embed.html` on the web app's own address: the packaged app's pages have no address
 * YouTube accepts (error 153), and a page that has one can also run YouTube's player with its controls off
 * and report to this one. So the app's own controls work on the video, as on one of ours: this exposes the
 * same handle the player package's component does. Where that page is not available (a native build with no
 * web address set) the frame is YouTube's embed with its own controls, and there is no handle.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { isDataSaverEnabled, userDataSaverEnabled, youtubeAlwaysAllow } from "@/globalConfig";
import { isNativeApp } from "@/util/inAppBrowser";
import { publicUrl } from "@/seo/publicSite";
import { youTubeEmbedUrl, youTubeIdOf, youTubeWatchUrl } from "@/util/youtube";
import { createYouTubePlayer, isYouTubeReport, type YouTubeCommand } from "@/util/youtubePlayer";

const props = defineProps<{ content: ContentDto; url: string }>();
const emit = defineEmits<{
    timeupdate: [currentTime: number, duration: number];
    loadedmetadata: [];
    ended: [];
}>();
const { t } = useI18n();

const id = computed(() => youTubeIdOf(props.url));
const dataSaver = computed(() => userDataSaverEnabled.value || isDataSaverEnabled());

/** Pressed Play on this video, in this view. */
const chosen = ref(false);
/** The box on the notice: remembered once Play is pressed. */
const remember = ref(false);

const loaded = computed(
    () => !!id.value && (chosen.value || (youtubeAlwaysAllow.value && !dataSaver.value)),
);

/**
 * The hosted page: on the web origin in the packaged app, on this origin in a browser. Absent where a
 * native build has no web origin to point at.
 */
const hostedPage = computed(() => {
    if (!id.value) return undefined;
    const path = `/youtube-embed.html?v=${id.value}&api=1`;
    const address = isNativeApp() ? publicUrl(path) : path;
    return address ? new URL(address, window.location.href) : undefined;
});

const frameSrc = computed(() => {
    if (!id.value) return undefined;
    return hostedPage.value?.toString() ?? youTubeEmbedUrl(id.value);
});

/** The frame can be driven only when it is the hosted page. */
const driven = computed(() => !!hostedPage.value);

const frame = shallowRef<HTMLIFrameElement | null>(null);

const youtube = createYouTubePlayer({
    send: (command: YouTubeCommand) => {
        const origin = hostedPage.value?.origin;
        if (origin) frame.value?.contentWindow?.postMessage(command, origin);
    },
    onTimeUpdate: (currentTime, duration) => emit("timeupdate", currentTime, duration),
    onLoadedMetadata: () => emit("loadedmetadata"),
    onEnded: () => emit("ended"),
});

function onMessage(event: MessageEvent) {
    // Only the hosted page in our own frame.
    if (!driven.value || event.source !== frame.value?.contentWindow) return;
    if (event.origin !== hostedPage.value?.origin || !isYouTubeReport(event.data)) return;
    youtube.receive(event.data);
}
onMounted(() => window.addEventListener("message", onMessage));
onBeforeUnmount(() => window.removeEventListener("message", onMessage));

function play() {
    if (remember.value) youtubeAlwaysAllow.value = true;
    chosen.value = true;
}

// What the media player reaches, as it does on the player package's component. Nothing, until there is a
// frame to drive.
const state = computed(() => (loaded.value && driven.value ? youtube.state : undefined));
const controller = computed(() =>
    loaded.value && driven.value
        ? {
              setPlaybackRate: youtube.setPlaybackRate,
              setAngle: async () => {},
              setAudioTrack: () => {},
              setSubtitleTrack: () => {},
              thumbnailAt: () => null,
          }
        : null,
);

defineExpose({
    state,
    controller,
    muted: computed(() => youtube.flags.muted),
    canMute: true,
    canPictureInPicture: false,
    airPlayAvailable: false,
    airPlayActive: false,
    setMuted: youtube.setMuted,
    play: async () => youtube.play(),
    pause: () => youtube.pause(),
    seek: (seconds: number) => youtube.seek(seconds),
    enterFullscreen: async () => {
        await frame.value?.requestFullscreen?.();
    },
    exitFullscreen: async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
    },
});
</script>

<template>
    <div
        class="relative aspect-video w-full overflow-hidden bg-black md:rounded-lg"
        data-test="youtubeEmbed"
    >
        <iframe
            v-if="loaded && frameSrc"
            ref="frame"
            :src="frameSrc"
            :title="content.title"
            class="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            data-test="youtubeFrame"
        />
        <!-- The video is driven from the page's own controls: a touch on the picture is not YouTube's to take
             (it would toggle playback, or open full-screen). Left off where the frame is YouTube's embed. -->
        <div
            v-if="loaded && driven"
            class="absolute inset-0"
            data-test="youtubeShield"
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
