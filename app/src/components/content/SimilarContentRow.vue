<script setup lang="ts">
import { computed, watch } from "vue";
import { type ContentDto, type Uuid } from "luminary-shared";
import { useMoreLikeThis } from "@/composables/useMoreLikeThis";
import { useI18n } from "vue-i18n";
import ContentCardRow from "./ContentCardRow.vue";

const props = defineProps<{
    selectedContent: ContentDto;
    tags: ContentDto[];
    /** Ids already shown by other rows on the page — dropped so nothing appears twice. */
    excludeIds: Set<Uuid>;
}>();
const emit = defineEmits<{ resolved: [items: ContentDto[]] }>();

const { t } = useI18n();

// Personalized "more like this" for the current article. Retrieval stays topical (seeded
// from this article's tags + title/summary FTS, plus this article's own saved highlights);
// rank()'s affinity scoring tilts the order toward the viewer's interests.
const { similar } = useMoreLikeThis(
    () => props.selectedContent,
    () => props.tags,
);

const items = computed(() => similar.value.filter((item) => !props.excludeIds.has(item._id)));

// Bubble the resolved list up so sibling rows below (author, because-you-read) can dedupe
// against it — they can't read it directly since this component (and its FTS work) is only
// mounted once LazyMount decides it's worth running (see the parent template).
watch(items, (value) => emit("resolved", value), { immediate: true });
</script>

<template>
    <section
        v-if="items.length"
        class="w-full pb-2"
    >
        <ContentCardRow
            :items="items"
            :title="t('content.similar_title')"
        />
    </section>
</template>
