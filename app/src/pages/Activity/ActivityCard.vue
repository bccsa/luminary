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
        class="group relative [&_[data-card-text]]:pr-10"
        :class="{ 'cursor-pointer': opensPassage }"
        :data-test="opensPassage ? 'activity-open-highlights' : undefined"
        @click.capture="onClick"
    >
        <!-- No publish date: in a list ordered by what the reader did, when the post came
             out says nothing, and the room goes to the passage instead. Progress is shown
             on a view alone — a like or a highlight says nothing about how far they got. -->
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
                <!-- The leading is what shapes the bands: a background paints the line's
                     content area only, so the room between lines comes from the padding
                     below and the gap between bands from what the leading leaves over. -->
                <p class="line-clamp-3 text-sm leading-7">
                    <!-- The palette is half-transparent, meant to sit over article text, so the
                         passage keeps body-text colour rather than the summary's grey. -->
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

        <!-- Marks the card as liked content. Decorative, so it never intercepts the tile's click.
             A highlight needs no mark of its own — the coloured passage already says what it is.
             The span carries the hook: a heroicon is a functional component with no declared
             props, so only `class` falls through to its `<svg>`. -->
        <span
            v-if="type === 'liked'"
            class="pointer-events-none absolute right-2 top-2"
            data-test="activity-liked-icon"
        >
            <HeartIcon
                class="h-5 w-5 text-yellow-400 drop-shadow"
                aria-hidden="true"
            />
            <!-- In the combined feed the heart is the only thing telling a liked card from a
                 viewed one, so it has to be readable rather than purely decorative. -->
            <span class="sr-only">{{ t("activity.marker.liked") }}</span>
        </span>
    </div>
</template>
