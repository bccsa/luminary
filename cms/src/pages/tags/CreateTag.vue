<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LCard from "@/components/common/LCard.vue";
import type { CreateContentParentDto, TagType } from "@/types";
import { useRoute, useRouter } from "vue-router";
import CreateContentForm from "@/components/content/CreateContentForm.vue";
import { useTagStore } from "@/stores/tag";

const route = useRoute();
const router = useRouter();
const tagStore = useTagStore();

const tagType = route.params.tagType as TagType;
// The name to show. This transforms "audioPlaylist" into "audio playlist"
const entityName = tagType
    .split(/(?=[A-Z])/)
    .join(" ")
    .toLowerCase();

const save = async (dto: CreateContentParentDto) => {
    const id = await tagStore.createTag({
        ...dto,
        tagType,
    });

    return router.push({
        name: "tags.edit",
        params: { id, language: dto.language.languageCode },
    });
};
</script>

<template>
    <BasePage :title="`Create ${entityName}`" centered>
        <div class="mx-auto max-w-xl">
            <LCard>
                <CreateContentForm :entity-name="entityName" @save="save" />
            </LCard>
        </div>
    </BasePage>
</template>
