<script setup lang="ts">
import { db } from "@/db/baseDatabase";
import { DocType, type ImageDto, type Uuid } from "@/types";
import LImage from "./LImage.vue";
import LButton from "../button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LCard from "../common/LCard.vue";
import ImageEditor from "./ImageEditor.vue";
import { ref } from "vue";

// TODO: Implement select event

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;
// TODO: Replace with a generic fallback image included in project source code
const fallbackImg: string =
    "https://cdn.activechristianity.org/image/upload/c_thumb,w_600,g_center/v1666007697/en_ke/f7bcwvet6axzmih97pv8.jpg";

const images = db.whereTypeAsRef<ImageDto[]>(DocType.Image, []);

const newImage = async () => {
    const id = db.uuid();
    await db.upsert<ImageDto>({
        _id: id,
        type: DocType.Image,
        name: "New Image",
        description: "",
        files: [],
        memberOf: ["group-private-content"],
        updatedTimeUtc: Date.now(),
    });
    selectedImageId.value = id;
};

const selectedImageId = ref<Uuid | undefined>(undefined);
</script>

<template>
    <div class="flex h-full flex-1 flex-col">
        <div class="mb-4 flex">
            <div class="flex-1"></div>
            <LButton variant="primary" :icon="PlusIcon" @click="newImage">New Image</LButton>
        </div>
        <div class="flex gap-4">
            <LCard class="flex-grow overflow-y-scroll">
                <div class="flex flex-wrap gap-4">
                    <div
                        v-for="image in images"
                        :key="image._id"
                        class="cursor-pointer overflow-hidden"
                        @click="selectedImageId = image._id"
                    >
                        <LImage
                            :imageId="image._id"
                            aspect-ratio="square"
                            size="thumbnail"
                            class="rounded shadow"
                            :base-url="baseUrl"
                            :fallback-img="fallbackImg"
                        />
                        <label>
                            <span class="text-sm">{{ image.name }}</span>
                        </label>
                    </div>
                </div>
            </LCard>
            <LCard class="w-1/2" v-if="selectedImageId">
                <ImageEditor :imageId="selectedImageId" :key="selectedImageId" />
            </LCard>
        </div>
    </div>
</template>
