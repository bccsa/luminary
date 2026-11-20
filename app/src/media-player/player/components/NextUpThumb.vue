<script setup lang="ts">
/**
 * A card's picture: the image itself first, then its fallback, then nothing. A broken-image glyph
 * on a card is worse than a plain tile.
 */
import { computed, ref, watch } from "vue";
import { imageAttempts } from "../image";
import type { PlayerUpNextItem } from "../upNext";

const props = defineProps<{ item: PlayerUpNextItem }>();

const attempts = computed(() =>
    imageAttempts({
        srcset: props.item.imageSrcset,
        src: props.item.imageUrl,
        fallback: props.item.fallbackImageUrl,
    }),
);
const index = ref(0);
watch(
    () => JSON.stringify(attempts.value),
    () => {
        index.value = 0;
    },
);
const attempt = computed(() => attempts.value[index.value] ?? null);

/** The card's width in the stylesheet, at its largest and its smallest. */
const SIZES = "(min-width: 900px) 350px, 280px";
</script>

<template>
    <img
        v-if="attempt"
        :key="index"
        :srcset="attempt.srcset"
        :sizes="attempt.srcset ? SIZES : undefined"
        :src="attempt.src"
        alt=""
        draggable="false"
        @error="index += 1"
    />
</template>
