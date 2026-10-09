<script setup lang="ts">
/**
 * What the viewer can read and do about what plays, under the picture: its categories, share and
 * bookmark, the summary, a taste of the article with the way to the page, and the copyright.
 */
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { BookOpenIcon } from "@heroicons/vue/20/solid";
import { BookmarkIcon as BookmarkSolid, TagIcon } from "@heroicons/vue/24/solid";
import { BookmarkIcon as BookmarkOutline } from "@heroicons/vue/24/outline";
import { AclPermission, DocType, TagType, verifyAccess, type ContentDto } from "luminary-shared";
import ShareMenu from "@/components/content/ShareMenu.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useGlobalCopyright } from "@/composables/useGlobalCopyright";
import { useBookmark } from "./useBookmark";

const props = defineProps<{ content: ContentDto }>();
defineEmits<{ read: [] }>();
const { t } = useI18n();

const content = toRef(props, "content");

// The categories and topics it is filed under, as the page shows them.
const tags = useContentQuery(
    () => {
        const ids = content.value.parentTags ?? [];
        return [{ parentId: { $in: ids } }, { parentType: DocType.Tag }];
    },
    { includeScheduled: false, useIndex: "content-parentId-publishDate-index" },
);
const categoryTags = computed(() =>
    tags.value.filter((tag) => tag.parentTagType === TagType.Category),
);

const { bookmarkable, isBookmarked, toggleBookmark } = useBookmark(content);

const canShare = computed(() => {
    if (!content.value.memberOf?.length) return true;
    return verifyAccess(content.value.memberOf, content.value.parentType!, AclPermission.Share);
});
const { copyrightText: globalCopyright } = useGlobalCopyright();
const copyright = computed(() => content.value.copyright || globalCopyright.value);
</script>

<template>
    <div
        class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-8 pt-1"
        data-test="mediaPlayerAbout"
    >
        <div
            v-if="categoryTags.length"
            class="flex flex-wrap gap-2"
            data-test="mediaPlayerAboutTags"
        >
            <span
                v-for="tag in categoryTags"
                :key="tag._id"
                class="flex items-center rounded-lg border border-yellow-500/25 bg-yellow-500/10 py-1 pl-1 pr-2 text-sm dark:bg-slate-700"
            >
                <TagIcon class="mr-2 h-5 w-5 text-yellow-500/75" />
                <span class="line-clamp-1">{{ tag.title }}</span>
            </span>
        </div>

        <div class="flex items-center gap-3">
            <button
                v-if="content.slug"
                type="button"
                class="flex h-11 items-center gap-2 rounded-full bg-yellow-500/15 px-4 text-sm font-semibold text-yellow-800 dark:text-yellow-300"
                data-test="mediaPlayerRead"
                @click="$emit('read')"
            >
                <BookOpenIcon class="h-5 w-5" />
                {{ t("media_player.read") }}
            </button>
            <button
                v-if="bookmarkable"
                type="button"
                class="flex h-11 w-11 items-center justify-center rounded-full"
                :aria-label="t('media_player.bookmark')"
                :aria-pressed="isBookmarked"
                data-test="mediaPlayerBookmark"
                @click="toggleBookmark"
            >
                <component
                    :is="isBookmarked ? BookmarkSolid : BookmarkOutline"
                    class="h-6 w-6"
                    :class="isBookmarked ? 'text-yellow-500' : 'text-zinc-500 dark:text-slate-400'"
                />
            </button>
            <ShareMenu
                v-if="canShare"
                :content="content"
                :copyright="copyright"
            />
        </div>

        <p
            v-if="content.summary"
            class="text-base text-zinc-700 dark:text-slate-200"
            data-test="mediaPlayerAboutSummary"
        >
            {{ content.summary }}
        </p>

        <!-- A taste of the article, not the whole of it: the page has it, with its highlights. -->
        <div
            v-if="content.text"
            class="relative"
        >
            <!-- eslint-disable-next-line vue/no-v-html -- the article, as the content page shows it -->
            <div
                class="prose prose-zinc max-h-40 max-w-full overflow-hidden dark:prose-invert prose-a:text-yellow-600 dark:prose-a:text-yellow-400"
                data-test="mediaPlayerAboutText"
                v-html="content.text"
            />
            <div
                class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
                aria-hidden="true"
            />
            <button
                type="button"
                class="mt-1 text-sm font-semibold text-yellow-700 dark:text-yellow-400"
                data-test="mediaPlayerAboutMore"
                @click="$emit('read')"
            >
                {{ t("content.read_more") }}
            </button>
        </div>

        <p
            v-if="copyright"
            class="text-xs text-zinc-400 dark:text-slate-500"
            data-test="mediaPlayerAboutCopyright"
        >
            {{ copyright }}
        </p>
    </div>
</template>
