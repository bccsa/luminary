<script setup lang="ts">
import { db, DocType, type ImageDto, type Uuid } from "luminary-shared";
import LImage from "./LImage.vue";
import LButton from "../button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LCard from "../common/LCard.vue";
import ImageEditor from "./ImageEditor.vue";
import { ref } from "vue";
import fallbackImg from "../../assets/fallback-image-cms.webp";

// TODO: Implement select event

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;
const images = db.whereTypeAsRef<ImageDto[]>(DocType.Image, []);

const newImage = async () => {
    selectedImage.value = {
        _id: db.uuid(),
        type: DocType.Image,
        name: "New Image",
        description: "",
        fileCollections: [],
        memberOf: [],
        updatedTimeUtc: Date.now(),
    };
};

const selectedImage = ref<ImageDto>();
</script>

<template>
    <div class="flex h-full flex-1 flex-col">
        <div class="mb-4 flex">
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
            <LCard class="w-1/2" v-if="selectedImage">
                <ImageEditor :image="selectedImage" :key="selectedImage._id" />
            </LCard>
        </div>
    </div>
</template>
