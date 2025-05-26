<script setup lang="ts">
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";
import { PlusIcon } from "@heroicons/vue/24/outline";
import type { DocType } from "luminary-shared";
import { RouterLink } from "vue-router";
import LButton from "../button/LButton.vue";
import type { OverviewRoute } from "../BasePage.vue";
import { computed } from "vue";

type Props = {
    title?: string;
    docType: DocType;
    to: OverviewRoute;
    canCreateNew?: boolean;
};

const props = defineProps<Props>();

// Format the title to have the first letter capitalized
const fTitle = computed(() => {
    const firstLetter = props.title?.charAt(0).toUpperCase() || "";
    const restOfTitle = props.title?.slice(1) || "";
    return `${firstLetter}${restOfTitle}`;
});
</script>

<template>
    <div class="flex w-full items-center justify-between gap-1">
        <h1 class="flex items-center gap-2 text-lg font-semibold leading-7">
            {{ fTitle }}
            <slot name="postTitleSlot"></slot>
        </h1>
        <div>
            <LButton
                v-if="canCreateNew && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :class="{
                    'flex items-center justify-center': isSmallScreen,
                }"
                :to="to"
                data-test="create-button"
            >
                {{ `Create ${docType}` }}
            </LButton>
            <div
                v-else
                class="flex h-max w-max items-center justify-center"
                @click="
                    () => {
                        router.push(to);
                    }
                "
            >
                <PlusIcon class="h-5 w-5 text-zinc-500" />
            </div>
        </div>
    </div>
</template>
