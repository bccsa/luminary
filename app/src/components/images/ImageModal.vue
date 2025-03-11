<script setup lang="ts">
import { computed, watch } from "vue";
import LImage from "./LImage.vue";
import type { ImageDto } from "luminary-shared";

type Props = {
    image: ImageDto;
    rounded?: boolean;
    size: "post" | "small" | "thumbnail";
    aspectRatio: "video" | "square" | "vertical" | "wide" | "classic";
    zoomable?: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits(["close"]);

const isMobile = computed(() => window.innerWidth < 768);
watch(isMobile, () => {
    console.log(isMobile.value);
});

const closeModal = () => {
    emit("close");
};

const { image, rounded, size, aspectRatio, zoomable } = props;
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        @click="closeModal"
    >
        <div
            class="relative flex h-full w-full items-center justify-center"
            @click.stop
            @click="closeModal"
        >
            <!-- Image Container with LImage -->
            <div class="flex h-[160vh] w-[165vh] items-center justify-center">
                <LImage
                    :image="image"
                    :size="isMobile ? 'post' : size"
                    :aspectRatio="aspectRatio"
                    :zoomable="zoomable"
                    :rounded="rounded"
                    class="object-contain"
                />
            </div>
        </div>
    </div>
</template>
