<script setup lang="ts">
import { type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import LImage from "../images/LImage.vue";
import { type AspectRatio, type ImageSize } from "../images/LImageProvider.vue";
import { PlayIcon, SpeakerWaveIcon } from "@heroicons/vue/24/solid";
import { getMediaDuration, getMediaProgress } from "@/globalConfig";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type Props = {
    content: ContentDto;
    showPublishDate?: boolean;
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;
    titlePosition?: "bottom" | "center" | "overlay";
    /** Shown below the title in overlay mode (e.g. uppercase category label). */
    overlayLabel?: string;
    showProgress?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
    aspectRatio: "video",
    imageSize: "thumbnail",
    titlePosition: "bottom",
    showProgress: false,
});

const publishDateText = computed(() => {
    if (
        !props.showPublishDate ||
        !props.content.parentPublishDateVisible ||
        !props.content.publishDate
    ) {
        return "";
    }
    return DateTime.fromMillis(props.content.publishDate)
        .setLocale(typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US")
        .toLocaleString(DateTime.DATETIME_MED);
});

const hasVideo = computed(() => Boolean(props.content.video));
const hasAudio = computed(
    () => !props.content.video && Boolean(props.content.parentMedia?.fileCollections?.length),
);

const mediaIconClass = computed(() =>
    props.titlePosition === "overlay"
        ? "absolute text-white/80 md:bottom-2 md:right-1 md:h-6 md:w-6 max-md:hidden"
        : "relative z-20 h-8 w-8 text-white lg:h-12 lg:w-12",
);

const media = ref<{ progress: number; duration: number }>({
    progress: 0,
    duration: 0,
});

const isComingSoon = computed(() => {
    const publishDate = props.content.publishDate;
    // "Coming soon" = published doc with a future publishDate AND the opt-in flag set.
    return (
        typeof publishDate === "number" &&
        publishDate > Date.now() &&
        props.content.parentShowComingSoon === true
    );
});

function formatDuration(seconds: number): string {
    const totalSeconds = Math.floor(seconds);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
        return `${mins.toString().padStart(1, "0")}:${secs.toString().padStart(2, "0")}`;
    }
}

const durationText = ref("");
const hasProgress = ref(false);
const allMedia = localStorage.getItem("mediaProgress");

if (allMedia) {
    const mediaIds = props.content.video
        ? [props.content.video]
        : (props.content.parentMedia?.fileCollections ?? []).map((f) => f.fileUrl);

    for (const mediaId of mediaIds) {
        const mediaProgress = getMediaProgress(mediaId, props.content._id);
        const mediaDuration = getMediaDuration(mediaId, props.content._id);

        if (mediaProgress > 0 && mediaDuration > 0) {
            hasProgress.value = true;
            media.value.progress = Math.min(100, (mediaProgress / mediaDuration) * 100);
            media.value.duration = mediaDuration;
            durationText.value = formatDuration(mediaDuration);
            break;
        }
    }
}
</script>

<template>
    <component
        :is="isComingSoon ? 'div' : 'RouterLink'"
        v-bind="
            isComingSoon
                ? {}
                : {
                      to: { name: 'content', params: { slug: props.content.slug } },
                  }
        "
        :aria-disabled="isComingSoon || undefined"
        class="ease-out-expo group transition"
        :class="
            isComingSoon
                ? 'cursor-not-allowed opacity-80 hover:brightness-100'
                : 'hover:brightness-[1.15]'
        "
    >
        <div class="avoid-inside ease-out-expo -m-2 p-2 active:shadow-inner">
            <div class="relative">
                <LImage
                    :image="content.parentImageData"
                    :content-parent-id="content.parentId"
                    :parent-image-bucket-id="content.parentImageBucketId"
                    :aspectRatio="aspectRatio"
                    :size="imageSize"
                >
                    <template #default>
                        <div
                            class="w-full"
                            v-if="titlePosition === 'bottom'"
                        >
                            <h3 class="mt-2 truncate text-sm text-zinc-800 dark:text-slate-50">
                                {{ content.title }}
                            </h3>
                            <div
                                v-if="publishDateText"
                                class="mt-0.5 text-xs text-zinc-500 dark:text-slate-400"
                            >
                                {{ publishDateText }}
                            </div>
                        </div>
                    </template>
                    <template #imageOverlay>
                        <div
                            v-if="isComingSoon"
                            class="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black/50 opacity-100 transition-opacity duration-200"
                        >
                            <span
                                class="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white shadow"
                            >
                                {{ t("content.coming_soon") }}
                            </span>
                        </div>
                        <div v-if="titlePosition !== 'center'">
                            <div
                                v-if="hasVideo"
                                class="absolute inset-0 z-20 flex items-center justify-center rounded-lg"
                            >
                                <PlayIcon
                                    :class="[
                                        mediaIconClass,
                                        'text-black',
                                        titlePosition === 'overlay' ? ' blur-[1.5px]' : 'blur-sm',
                                    ]"
                                />
                            </div>
                            <div
                                v-if="hasVideo"
                                class="absolute inset-0 z-20 flex items-center justify-center rounded-lg"
                            >
                                <PlayIcon :class="mediaIconClass" />
                            </div>
                            <div
                                v-if="hasAudio"
                                class="absolute inset-0 z-20 flex items-center justify-center rounded-lg"
                            >
                                <SpeakerWaveIcon
                                    :class="[
                                        mediaIconClass,
                                        'text-black',
                                        titlePosition === 'overlay' ? ' blur-[1.5px]' : 'blur-sm',
                                    ]"
                                />
                            </div>
                            <div
                                v-if="hasAudio"
                                class="absolute inset-0 z-20 flex items-center justify-center rounded-lg"
                            >
                                <SpeakerWaveIcon :class="mediaIconClass" />
                            </div>
                        </div>
                        <div
                            v-else
                            class="flex h-full max-h-full w-full max-w-full items-center justify-center overflow-clip bg-gradient-to-t from-black/50 to-black/20 text-sm font-semibold"
                        >
                            <p class="absolute m-2 text-pretty text-center text-black blur-sm">
                                {{ content.title }}
                            </p>
                            <p
                                class="absolute m-2 text-pretty text-center text-white dark:text-slate-200"
                            >
                                {{ content.title }}
                            </p>
                        </div>

                        <div
                            v-if="titlePosition === 'overlay'"
                            class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end rounded-lg bg-gradient-to-t from-black via-black/65 to-transparent px-3 pb-1 pt-4"
                        >
                            <div class="flex items-end justify-between gap-1.5">
                                <h3
                                    class="line-clamp-2 text-sm font-semibold leading-snug text-white"
                                >
                                    {{ content.title }}
                                </h3>
                                <PlayIcon
                                    v-if="hasVideo"
                                    class="text mt-1 h-4 w-4 flex-shrink-0 text-white md:hidden"
                                />
                            </div>
                            <p
                                v-if="overlayLabel"
                                class="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-white/80"
                            >
                                {{ overlayLabel }}
                            </p>
                            <p
                                v-else-if="publishDateText"
                                class="mt-1 truncate text-[11px] text-white/80"
                            >
                                {{ publishDateText }}
                            </p>
                        </div>

                        <div
                            v-if="
                                showProgress &&
                                (content.video || content.parentMedia?.fileCollections?.length) &&
                                hasProgress
                            "
                            class="absolute bottom-2 left-0 right-0 z-20 mx-1 rounded-md bg-black/50 px-1"
                            :class="titlePosition === 'overlay' ? 'bottom-[4.5rem]' : ''"
                        >
                            <div class="flex h-4 w-full items-center gap-2">
                                <div
                                    class="relative h-2 flex-1 overflow-hidden rounded bg-zinc-600"
                                >
                                    <div
                                        class="absolute left-0 top-0 h-full bg-white"
                                        :style="{ width: `${media.progress}%` }"
                                    ></div>
                                </div>
                                <span class="whitespace-nowrap text-xs text-white">
                                    {{ durationText }}
                                </span>
                            </div>
                        </div>
                    </template>
                </LImage>
            </div>
        </div>
    </component>
</template>
