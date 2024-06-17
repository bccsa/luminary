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
} from "@/types";
import { computed } from "vue";
import TagSelector2 from "./TagSelector2.vue";
import { capitaliseFirstLetter } from "@/util/string";
import FormLabel from "@/components/forms/FormLabel.vue";
import LToggle from "@/components/forms/LToggle.vue";
import { useUserAccessStore } from "@/stores/userAccess";

const { verifyAccess } = useUserAccessStore();

type Props = {
    docType: DocType;
    language?: LanguageDto;
};
const props = defineProps<Props>();
const parent = defineModel<PostDto | TagDto>();

const canEdit = computed(() => {
    if (parent && parent.value) {
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
            v-if="docType == DocType.Tag && parent && (parent as TagDto).pinned != undefined"
            class="mb-6 flex items-center justify-between"
        >
            <FormLabel>Pinned</FormLabel>
            <LToggle v-model="(parent as TagDto).pinned" :disabled="!canEdit" />
        </div>

        <LInput
            name="parent.image"
            label="Default image"
            :icon="LinkIcon"
            placeholder="https://..."
            :disabled="!canEdit"
            v-model="parent.image"
        >
            This image can be overridden in a translation
        </LInput>

        <TagSelector2
            v-model="parent"
            :docType="docType"
            :language="language"
            :tagType="TagType.Category"
            label="Categories"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />

        <TagSelector2
            v-model="parent"
            :docType="docType"
            :language="language"
            :tagType="TagType.Topic"
            label="Topics"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />

        <TagSelector2
            v-model="parent"
            :docType="docType"
            :language="language"
            :tagType="TagType.AudioPlaylist"
            label="Audio Playlists"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />
    </LCard>
</template>
