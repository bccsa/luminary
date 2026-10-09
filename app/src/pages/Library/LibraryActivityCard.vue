<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import { TrashIcon } from "@heroicons/vue/24/outline";
import { HeartIcon } from "@heroicons/vue/24/solid";
import ContentTile from "@/components/content/ContentTile.vue";
import type { UserActivityType } from "@/userActivity/db";
import { HIGHLIGHT_COLORS, type HighlightColor } from "@/util/highlightRanges";

const { t } = useI18n();

type Props = {
    content: ContentDto;
    /** Which activity this card stands for; also names its remove button for tests. */
    type: UserActivityType;
    removable?: boolean;
    /** The passage shown in place of the summary, for a highlight. */
    excerpt?: string;
    /** The colour the passage was highlighted in, painted behind it. */
    excerptColor?: HighlightColor;
    /** Click the card to open its detail instead of navigating to the article. */
    opensDetail?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    removable: false,
});

const emit = defineEmits<{ remove: []; open: [] }>();

/**
 * Capturing the click leaves ContentTile untouched — its link, hover and focus all keep
 * working — while the card opens its detail instead of navigating. The card's own buttons
 * are let through, since capture would otherwise swallow them before they ever fire.
 */
const onClick = (event: MouseEvent) => {
    if (!props.opensDetail) return;
    if ((event.target as Element | null)?.closest("button")) return;

    event.stopPropagation();
    event.preventDefault();
    emit("open");
};
</script>

<template>
    <div
        class="group relative [&_[data-card-text]]:pr-10"
        :class="{ 'cursor-pointer': opensDetail }"
        :data-test="opensDetail ? 'library-open-highlights' : undefined"
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
                        class="bg-transparent box-decoration-clone px-1.5 py-1 text-zinc-800 dark:text-slate-100"
                        :style="
                            excerptColor ? { backgroundColor: HIGHLIGHT_COLORS[excerptColor] } : {}
                        "
                        data-test="library-excerpt"
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
            data-test="library-liked-icon"
        >
            <HeartIcon
                class="h-5 w-5 text-yellow-400 drop-shadow"
                aria-hidden="true"
            />
            <!-- In the combined feed the heart is the only thing telling a liked card from a
                 viewed one, so it has to be readable rather than purely decorative. -->
            <span class="sr-only">{{ t("library.activity.liked") }}</span>
        </span>

        <!-- Bottom-right of the card. Always visible on touch devices, which have no hover to
             reveal it; on hover-capable devices it fades in when the card is hovered. -->
        <button
            v-if="removable"
            type="button"
            class="absolute bottom-2 right-2 rounded-full p-1.5 text-zinc-500 transition hover:text-red-600 focus:text-red-600 focus:opacity-100 active:text-red-700 dark:text-slate-400 dark:hover:text-red-400 dark:focus:text-red-400 dark:active:text-red-500 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
            :aria-label="t('library.remove.label')"
            :data-test="`library-remove-${type}`"
            @click.stop.prevent="$emit('remove')"
        >
            <TrashIcon class="h-4 w-4" />
        </button>
    </div>
</template>
