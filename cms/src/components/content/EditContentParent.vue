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
import FormLabel from "@/components/forms/FormLabel.vue";
import LToggle from "@/components/forms/LToggle.vue";

type Props = {
    docType: DocType;
    tagOrPostType: TagType | PostType;
    language?: LanguageDto;
    disabled: boolean;
};
defineProps<Props>();
const parent = defineModel<ContentParentDto>("parent");

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
        collapsible
        v-if="parent"
        class="bg-white"
    >
        <GroupSelector
            v-model:groups="parent.memberOf"
            :disabled="disabled"
            :docType="docType"
            class="mb-3"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Category"
            label="Categories"
            class="mb-3"
            :disabled="disabled"
            :key="language?._id"
        />

        <TagSelector
            v-model:parent="parent"
            :language="language"
            :tagType="TagType.Topic"
            label="Topics"
            class="mb-3"
            :disabled="disabled"
            :key="language?._id"
        />

        <!-- Toggle for Publish Date Visibility -->
        <div
            class="mt-3 flex items-center justify-between"
            :class="{ 'mb-2': docType !== DocType.Tag }"
        >
            <FormLabel>Show publish date</FormLabel>
            <LToggle v-model="parent.publishDateVisible" :disabled="disabled" />
        </div>

        <div
            v-if="docType == DocType.Tag && parent && (parent as TagDto).pinned != undefined"
            class="mt-3 flex items-center justify-between"
            :class="{ 'my-3': docType == DocType.Tag }"
        >
            <FormLabel>Pinned</FormLabel>
            <LToggle v-model="pinned" :disabled="disabled" />
        </div>
    </LCard>
</template>
