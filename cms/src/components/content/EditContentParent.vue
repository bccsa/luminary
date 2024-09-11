<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LCard from "@/components/common/LCard.vue";
import { Cog6ToothIcon, LinkIcon } from "@heroicons/vue/20/solid";
import {
    TagType,
    DocType,
    AclPermission,
    type PostDto,
    type TagDto,
    type LanguageDto,
    verifyAccess,
    db,
    type ImageDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import TagSelector from "./TagSelector.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import { capitaliseFirstLetter } from "@/util/string";
import FormLabel from "@/components/forms/FormLabel.vue";
import LToggle from "@/components/forms/LToggle.vue";
import LImage from "../images/LImage.vue";
import fallbackImg from "../../assets/fallback-image-cms.webp";
import LDialog from "../common/LDialog.vue";
import ImageBrowser from "../images/ImageBrowser.vue";
const baseUrl = import.meta.env.VITE_CLIENT_IMAGES_URL;

type Props = {
    docType: DocType;
    language?: LanguageDto;
};
const props = defineProps<Props>();
const parent = defineModel<PostDto | TagDto>();
const openImageDialog = ref(false);

const image = ref<ImageDto>();

watch([parent, openImageDialog], async () => {
    if (parent.value && parent.value.imageId) {
        image.value = await db.get<ImageDto>(parent.value.imageId);
    }
});

const canEdit = computed(() => {
    if (parent.value) {
        if (parent.value.memberOf == undefined || parent.value.memberOf.length == 0) {
            // Allow editing if the parent is not part of any group to allow the editor to set a group
            return true;
        }

        return verifyAccess(parent.value.memberOf, props.docType, AclPermission.Edit, "all");
    }

    return false;
});
</script>

<template>
    <LCard
        :title="`${capitaliseFirstLetter(docType.toString())} settings`"
        :icon="Cog6ToothIcon"
        class="sticky top-20"
        collapsible
        v-if="parent"
    >
        <div
            class="mb-6 cursor-pointer overflow-hidden rounded-lg shadow"
            @click="openImageDialog = true"
        >
            <LImage
                v-if="image"
                :image="image"
                aspectRatio="video"
                size="post"
                :baseUrl="baseUrl"
                :fallbackImg="fallbackImg"
                class=""
            />

            <div v-else-if="parent.image" class="relative">
                <p
                    class="absolute left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] rounded-lg bg-zinc-100 p-1 text-center text-gray-400 opacity-50"
                >
                    Legacy image
                </p>
                <img :src="parent.image" />
            </div>

            <div v-else class="bg-zinc-50 p-10">
                <p class="text-center text-gray-400">Image not set</p>
            </div>
        </div>
        <div
            v-if="docType == DocType.Tag && parent && (parent as TagDto).pinned != undefined"
            class="mb-6 flex items-center justify-between"
        >
            <FormLabel>Pinned</FormLabel>
            <LToggle v-model="(parent as TagDto).pinned" :disabled="!canEdit" />
        </div>

        <!-- Toggle for Publish Date Visibility -->
        <div class="mb-6 flex items-center justify-between">
            <FormLabel>Show publish date</FormLabel>
            <LToggle v-model="parent.publishDateVisible" :disabled="!canEdit" />
        </div>

        <GroupSelector
            v-model:groups="parent.memberOf"
            :disabled="!canEdit"
            :docType="docType"
            class="mt-6"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Category"
            label="Categories"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Topic"
            label="Topics"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.AudioPlaylist"
            label="Audio Playlists"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />
    </LCard>
    <LDialog v-model:open="openImageDialog" v-if="parent">
        <ImageBrowser
            :selectable="true"
            @selectImage="
                openImageDialog = false;
                parent.imageId = $event;
            "
            :contentImageId="parent.imageId"
        />
    </LDialog>
</template>
