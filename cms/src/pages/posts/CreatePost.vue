<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LCard from "@/components/common/LCard.vue";
import type { CreateContentParentDto } from "@/types";
import { usePostStore } from "@/stores/post";
import { useRouter } from "vue-router";
import CreateContentForm from "@/components/content/CreateContentForm.vue";

const postStore = usePostStore();
const router = useRouter();

const save = async (dto: CreateContentParentDto) => {
    const id = await postStore.createPost(dto);

    return router.replace({
        name: "posts.edit",
        params: { id, language: dto.language.languageCode },
    });
};
</script>

<template>
    <BasePage title="Create post" centered>
        <div class="mx-auto max-w-xl">
            <LCard>
                <CreateContentForm entity-name="post" @save="save" />
            </LCard>
        </div>
    </BasePage>
</template>
