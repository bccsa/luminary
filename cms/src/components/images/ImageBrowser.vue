<script setup lang="ts">
import { db, DocType, type ImageDto, type Uuid } from "luminary-shared";
import LImage from "./LImage.vue";
import LButton from "../button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LCard from "../common/LCard.vue";
import ImageEditor from "./ImageEditor.vue";
import { ref } from "vue";
import fallbackImg from "../../assets/fallback-image-cms.webp";

type Props = {
    requiredGroupIds?: Uuid[];
    selectable?: boolean;
};
const props = defineProps<Props>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;
const images = db.whereTypeAsRef<ImageDto[]>(DocType.Image, []);

const newImage = async () => {
    selectedImage.value = {
        _id: db.uuid(),
        type: DocType.Image,
        name: "New Image",
        description: "",
        fileCollections: [],
        memberOf: props.requiredGroupIds ? props.requiredGroupIds : [],
        updatedTimeUtc: Date.now(),
    };
};

const selectedImage = ref<ImageDto>();
</script>

<template>
    <div class="flex h-full flex-1 flex-col">
        <div class="mb-4 flex items-center">
            <h3 class="text-base font-semibold leading-6 text-zinc-900">Image browser</h3>
            <div class="flex-1"></div>
            <LButton variant="primary" :icon="PlusIcon" @click="newImage" data-test="new-image"
                >New Image</LButton
            >
        </div>
        <div class="flex gap-4">
            <LCard class="flex-grow overflow-y-scroll">
                <div class="flex flex-wrap gap-4">
                    <div
                        v-for="image in images"
                        :key="image._id"
                        class="cursor-pointer overflow-hidden"
                        @click="selectedImage = image"
                    >
                        <LImage
                            :image="image"
                            :key="image._id"
                            aspect-ratio="square"
                            size="thumbnail"
                            class="rounded-lg shadow"
                            :base-url="baseUrl"
                            :fallback-img="fallbackImg"
                        />
                        <label>
                            <span class="text-sm">{{ image.name }}</span>
                        </label>
                    </div>
                </div>
            </LCard>
            <LCard class="w-80" v-if="selectedImage">
                <ImageEditor
                    :image="selectedImage"
                    :selectable="selectable"
                    :key="selectedImage._id"
                    @select="$emit('select', $event as Uuid)"
                />
            </LCard>
        </div>
    </div>
</template>
