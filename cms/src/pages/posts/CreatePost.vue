<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LCard from "@/components/common/LCard.vue";
import type { CreateContentParentDto } from "@/types";
import { usePostStore } from "@/stores/post";
import { useRouter } from "vue-router";
import CreateContentForm from "@/components/content/CreateContentForm.vue";
import { useNotificationStore } from "@/stores/notification";

const postStore = usePostStore();
const router = useRouter();
const { addNotification } = useNotificationStore();

const save = async (dto: CreateContentParentDto) => {
    const id = await postStore.createPost(dto);

    addNotification({
        title: `New post created`,
        description: `Saved as draft with a translation for ${dto.language.name}.`,
        state: "success",
    });

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
