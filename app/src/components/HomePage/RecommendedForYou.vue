<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useRecommendations } from "@/composables/useRecommendations";
import { recordImpressionMiss } from "@/recommendation/affinityStore";
import { useIntersectionObserver } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { ref, watch, onBeforeUnmount } from "vue";
import type { Uuid } from "luminary-shared";

const { t } = useI18n();
const { recommended } = useRecommendations();

/** How long the carousel must have stayed visible before an unclicked tile counts as
 *  "scrolled past" rather than "still being read". Evaluated at carousel-exit (scrolled
 *  off-screen, or this component unmounts on navigation) rather than a wall-clock timer,
 *  so a deliberate click made after a long, genuine read is never penalized — only a
 *  timer racing the click could double-count that case. */
const DWELL_MS = 6000;

const root = ref<HTMLElement | null>(null);
let visibleSince: number | undefined;
// contentId -> its tag ids, for whatever batch is currently on screen and un-penalized.
let pending = new Map<Uuid, Uuid[]>();

function penalizePending() {
    // One call across the unique tag set for the whole batch — otherwise a tag that
    // appears on many tiles (typically the user's *highest*-affinity tag, since that's
    // what retrieval selected on) takes one compounding penalty per tile instead of one.
    const tagIds = new Set<Uuid>();
    for (const tags of pending.values()) for (const tag of tags) tagIds.add(tag);
    pending = new Map();
    if (tagIds.size > 0) void recordImpressionMiss([...tagIds]);
}

// Only penalize tiles that were genuinely scrolled past for at least DWELL_MS — a
// carousel glimpsed for a second on the way to something else shouldn't count.
function maybePenalizeOnExit() {
    if (visibleSince !== undefined && Date.now() - visibleSince >= DWELL_MS) {
        penalizePending();
    }
    visibleSince = undefined;
}

// Clicking a tile is a deliberate choice regardless of how long the user dwelled first —
// it must never also count as "scrolled past". Capture the click before RouterLink
// navigates and drop that tile from the pending set so exit/unmount can't penalize it.
function onCarouselClick(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-content-id]");
    if (target?.dataset.contentId) pending.delete(target.dataset.contentId);
}

const { stop } = useIntersectionObserver(
    root,
    ([entry]) => {
        if (entry?.isIntersecting) {
            visibleSince = Date.now();
        } else {
            maybePenalizeOnExit();
        }
    },
    { threshold: 0.5 },
);

// A fresh batch of recommendations (e.g. after a profile update) resets tracking —
// only content actually shown to the user for the dwell window should be penalized.
watch(
    recommended,
    (docs) => {
        pending = new Map(docs.map((d) => [d._id, d.parentTags ?? []]));
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    // Covers navigation away (route change) while the carousel is still on screen —
    // the intersection observer never fires an exit in that case.
    maybePenalizeOnExit();
    stop();
});
</script>

<template>
    <div ref="root" @click="onCarouselClick">
        <HorizontalContentTileCollection
            v-if="recommended.length > 0"
            :contentDocs="recommended"
            :title="t('home.recommended')"
            :showPublishDate="false"
            class="pb-1 pt-4"
        />
    </div>
</template>
