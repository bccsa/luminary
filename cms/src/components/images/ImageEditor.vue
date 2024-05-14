<script setup lang="ts">
import LInput from "../forms/LInput.vue";
import { defineProps, ref } from "vue";
import LTextarea from "../forms/LTextarea.vue";
import LButton from "../button/LButton.vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import LSelect from "../forms/LSelect.vue";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";

type Props = {
    maxFileSize?: number;
};
const props = defineProps<Props>();

const fileName = ref<typeof LInput | undefined>(undefined);
const description = ref<typeof LInput | undefined>(undefined);

const presets = [
    { label: "default", value: "default" },
    { label: "photo", value: "photo" },
    { label: "picture", value: "picture" },
    { label: "drawing", value: "drawing" },
    { label: "icon", value: "icon" },
    { label: "text", value: "text" },
];
const selectedPreset = ref(presets[0].value);

const tmpWidth = 640;
const tmpHeight = 360;
</script>

<template>
    <div class="items-end gap-4 sm:flex">
        <LInput ref="fileName" name="fileName" label="Image name" class="mb-2 flex-1" />
        <div class="mb-2 flex items-end gap-4">
            <LSelect
                name="preset"
                label="Upload preset"
                class="w-fit"
                :options="presets"
                v-model="selectedPreset"
            ></LSelect>
            <div class="flex flex-col">
                <label class="mb-3 w-full text-right text-xs text-zinc-900"
                    >Max size: {{ maxFileSize }}MB</label
                >
                <LButton :icon="ArrowUpOnSquareIcon" class="h-9">Upload</LButton>
            </div>
        </div>
    </div>

    <LTextarea ref="description" name="description" label="Description" />
    <div>
        <!-- Group selector here -->
    </div>

    <h3 class="mt-4 text-sm font-medium leading-6 text-zinc-900 dark:text-zinc-100">
        File versions
    </h3>

    <div class="flex flex-wrap gap-4">
        <ImageEditorThumbnail
            filename="https://images.cdn.bcc.africa/2024/20240512_1050_Childrens_Meeting.jpg"
            :fileWidth="tmpWidth"
            :fileHeight="tmpHeight"
        />
        <ImageEditorThumbnail
            filename="https://imgix.bcc.media/eff559c7-18b1-4742-85b9-a52abafbe921.jpg?w=2447&h=3640&fit=crop&crop=faces"
            :fileWidth="tmpHeight"
            :fileHeight="tmpWidth"
        />
        <ImageEditorThumbnail
            filename="https://images.cdn.bcc.africa/2024/20240512_1050_Childrens_Meeting.jpg"
            :fileWidth="tmpWidth"
            :fileHeight="tmpHeight"
        />
        <ImageEditorThumbnail
            filename="https://imgix.bcc.media/eff559c7-18b1-4742-85b9-a52abafbe921.jpg?w=2447&h=3640&fit=crop&crop=faces"
            :fileWidth="tmpHeight"
            :fileHeight="tmpWidth"
        /><ImageEditorThumbnail
            filename="https://images.cdn.bcc.africa/2024/20240512_1050_Childrens_Meeting.jpg"
            :fileWidth="tmpWidth"
            :fileHeight="tmpHeight"
        />
        <ImageEditorThumbnail
            filename="https://imgix.bcc.media/eff559c7-18b1-4742-85b9-a52abafbe921.jpg?w=2447&h=3640&fit=crop&crop=faces"
            :fileWidth="tmpHeight"
            :fileHeight="tmpWidth"
        /><ImageEditorThumbnail
            filename="https://images.cdn.bcc.africa/2024/20240512_1050_Childrens_Meeting.jpg"
            :fileWidth="tmpWidth"
            :fileHeight="tmpHeight"
        />
        <ImageEditorThumbnail
            filename="https://imgix.bcc.media/eff559c7-18b1-4742-85b9-a52abafbe921.jpg?w=2447&h=3640&fit=crop&crop=faces"
            :fileWidth="tmpHeight"
            :fileHeight="tmpWidth"
        /><ImageEditorThumbnail
            filename="https://images.cdn.bcc.africa/2024/20240512_1050_Childrens_Meeting.jpg"
            :fileWidth="tmpWidth"
            :fileHeight="tmpHeight"
        />
        <ImageEditorThumbnail
            filename="https://imgix.bcc.media/eff559c7-18b1-4742-85b9-a52abafbe921.jpg?w=2447&h=3640&fit=crop&crop=faces"
            :fileWidth="tmpHeight"
            :fileHeight="tmpWidth"
        /><ImageEditorThumbnail
            filename="https://images.cdn.bcc.africa/2024/20240512_1050_Childrens_Meeting.jpg"
            :fileWidth="tmpWidth"
            :fileHeight="tmpHeight"
        />
        <ImageEditorThumbnail
            filename="https://imgix.bcc.media/eff559c7-18b1-4742-85b9-a52abafbe921.jpg?w=2447&h=3640&fit=crop&crop=faces"
            :fileWidth="tmpHeight"
            :fileHeight="tmpWidth"
        />
    </div>
</template>
