<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import { Cog6ToothIcon } from "@heroicons/vue/20/solid";
import {
    TagType,
    DocType,
    type TagDto,
    type LanguageDto,
    type ContentParentDto,
    PostType,
} from "luminary-shared";
import { computed } from "vue";
import TagSelector from "./TagSelector.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import { capitaliseFirstLetter } from "@/util/string";
import FormLabel from "../../components/forms/FormLabel.vue";
import LToggle from "../../components/forms/LToggle.vue";
import ImageEditor from "../images/ImageEditor.vue";

type Props = {
    docType: DocType;
    tagOrPostType: TagType | PostType;
    language?: LanguageDto;
    disabled: boolean;
};
defineProps<Props>();
const parent = defineModel<ContentParentDto>();

// Convert the pinned property to a boolean for the toggle
const pinned = computed({
    get() {
        return (parent.value as TagDto).pinned ? true : false;
    },
    set(value: boolean) {
        if (parent.value) {
            (parent.value as TagDto).pinned = value ? 1 : 0;
        }
    },
});
</script>

<template>
    <LCard
        :title="`${capitaliseFirstLetter(tagOrPostType)} settings`"
        :icon="Cog6ToothIcon"
        class="sticky top-20"
        collapsible
        v-if="parent"
    >
        <GroupSelector v-model:groups="parent.memberOf" :disabled="disabled" :docType="docType" />
        <ImageEditor :disabled="disabled" v-model:parent="parent" class="my-4" />
        <div
            v-if="docType == DocType.Tag && parent && (parent as TagDto).pinned != undefined"
            class="mb-6 flex items-center justify-between"
        >
            <FormLabel>Pinned</FormLabel>
            <LToggle v-model="pinned" :disabled="disabled" />
        </div>

        <!-- Toggle for Publish Date Visibility -->
        <div class="mb-6 flex items-center justify-between">
            <FormLabel>Show publish date</FormLabel>
            <LToggle v-model="parent.publishDateVisible" :disabled="disabled" />
        </div>

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Category"
            label="Categories"
            class="mt-6"
            :disabled="disabled"
            :key="language?._id"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Topic"
            label="Topics"
            class="mt-6"
            :disabled="disabled"
            :key="language?._id"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.AudioPlaylist"
            label="Audio Playlists"
            class="mt-6"
            :disabled="disabled"
            :key="language?._id"
        />
    </LCard>
</template>
