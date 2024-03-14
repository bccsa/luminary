<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LCard from "@/components/common/LCard.vue";
import type { CreateContentParentDto } from "@/types";
import { useRouter } from "vue-router";
import CreateContentForm from "@/components/content/CreateContentForm.vue";
import { useTagStore } from "@/stores/tag";

const tagStore = useTagStore();
const router = useRouter();

const save = async (dto: CreateContentParentDto) => {
    const id = await tagStore.createTag(dto);

    return router.push({
        name: "tags.edit",
        params: { id, language: dto.language.languageCode },
    });
};
</script>

<template>
    <BasePage title="Create tag" centered>
        <div class="mx-auto max-w-xl">
            <LCard>
                <CreateContentForm entity-name="tag" @save="save" />
            </LCard>
        </div>
    </BasePage>
</template>
