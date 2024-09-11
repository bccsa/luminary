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
    contentImageId?: Uuid;
};
const props = defineProps<Props>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;
const images = db.whereTypeAsRef<ImageDto[]>(DocType.Image, []);

const newImage = async () => {
    contentImage.value = {
        _id: db.uuid(),
        type: DocType.Image,
        name: "New Image",
        description: "",
        fileCollections: [],
        memberOf: props.requiredGroupIds ? props.requiredGroupIds : [],
        updatedTimeUtc: Date.now(),
    };
};

const contentImage = ref<ImageDto>();
const userSelectedImageId = ref<Uuid>();
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
                <div class="flex flex-wrap">
                    <div
                        v-for="image in images"
                        :key="image._id"
                        class="cursor-pointer overflow-hidden"
                        @click="
                            contentImage = image;
                            userSelectedImageId = image._id;
                        "
                        :class="[
                            userSelectedImageId == image._id ? 'border-zinc-300 bg-zinc-100' : '',
                            contentImageId == image._id ? 'border-orange-300 bg-orange-100' : '',

                            'rounded-lg border-2 border-solid border-transparent p-2',
                        ]"
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
            <LCard class="w-80" v-if="contentImage">
                <ImageEditor
                    :image="contentImage"
                    :selectable="selectable"
                    :key="contentImage._id"
                    @selectImage="$emit('selectImage', $event as Uuid)"
                />
            </LCard>
        </div>
    </div>
</template>
