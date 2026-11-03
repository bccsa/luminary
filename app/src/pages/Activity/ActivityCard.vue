<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import { type ContentDto, type HighlightColor, type UserActivityType } from "luminary-shared";
import { HeartIcon } from "@heroicons/vue/24/solid";
import ContentTile from "@/components/content/ContentTile.vue";
import { HIGHLIGHT_COLORS } from "@/util/highlightRanges";

const { t } = useI18n();

type Props = {
    content: ContentDto;
    /** Which activity this card stands for. */
    type: UserActivityType;
    /** The passage shown in place of the summary, for a highlight. */
    excerpt?: string;
    /** The colour the passage was highlighted in, painted behind it. */
    excerptColor?: HighlightColor;
    /** Click the card to open its passage instead of navigating to the top of the article. */
    opensPassage?: boolean;
};

const props = defineProps<Props>();

const emit = defineEmits<{ open: [] }>();

/**
 * Capturing the click leaves ContentTile untouched — its link, hover and focus all keep
 * working — while the card opens its passage instead of navigating. The card's own buttons
 * are let through, since capture would otherwise swallow them before they ever fire.
 */
const onClick = (event: MouseEvent) => {
    if (!props.opensPassage) return;
    if ((event.target as Element | null)?.closest("button")) return;

    event.stopPropagation();
    event.preventDefault();
    emit("open");
};
</script>

<template>
    <div
        class="group relative"
        :class="{ 'cursor-pointer': opensPassage }"
        :data-test="opensPassage ? 'activity-open-highlights' : undefined"
        @click.capture="onClick"
    >
        <ContentTile
            :content="content"
            layout="card"
            :show-progress="type === 'viewed'"
            :show-publish-date="false"
            class="h-full w-full"
        >
            <template
                v-if="excerpt"
                #summary
            >
                <p class="line-clamp-3 text-sm leading-7">
                    <mark
                        class="bg-transparent box-decoration-clone px-1.5 py-1 pr-3.5 text-zinc-800 dark:text-slate-100"
                        :style="
                            excerptColor ? { backgroundColor: HIGHLIGHT_COLORS[excerptColor] } : {}
                        "
                        data-test="activity-excerpt"
                        >{{ excerpt }}</mark
                    >
                </p>
            </template>
        </ContentTile>

        <span
            v-if="type === 'liked'"
            class="pointer-events-none absolute left-2 top-2"
            data-test="activity-liked-icon"
        >
            <HeartIcon
                class="h-6 w-6 text-yellow-400 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]"
                aria-hidden="true"
            />
            <span class="sr-only">{{ t("activity.marker.liked") }}</span>
        </span>
    </div>
</template>
