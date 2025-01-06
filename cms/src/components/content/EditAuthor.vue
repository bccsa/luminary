<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import LInput from "@/components/forms/LInput.vue";
import { UserCircleIcon } from "@heroicons/vue/20/solid";
import { type ContentDto } from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <LCard
        title="Author"
        :icon="UserCircleIcon"
        collapsible
        v-if="content?.author != undefined"
        data-test="authorContent"
    >
        <LInput
            name="author"
            v-model="content.author"
            placeholder="John Doe..."
            :disabled="disabled"
        />
    </LCard>
</template>
