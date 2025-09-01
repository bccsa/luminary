<script setup lang="ts">
import { type ContentDto, type GroupDto, type LanguageDto, DocType, db } from "luminary-shared";
import {
    contentOverviewQuery,
    loadingContentOverviewContent,
    type ContentOverviewQueryOptions,
} from "./query";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import ContentDisplayCard from "./ContentDisplayCard.vue";
import { ref, watch } from "vue";
import LoadingSpinner from "../LoadingSpinner.vue";
import LoadingBar from "../LoadingBar.vue";

type Props = {
    queryOptions: ContentOverviewQueryOptions;
    groups: GroupDto[];
    contentDocsTotal?: number;
};
const props = defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const contentDocs = contentOverviewQuery(props.queryOptions);

const wasContentDocsFound = ref(false);

watch(contentDocs, (newValue) => {
    if (newValue?.docs?.length == 0) {
        loadingContentOverviewContent.value = false;
        wasContentDocsFound.value = false;
    } else {
        wasContentDocsFound.value = true;
        loadingContentOverviewContent.value = false;
    }
});
</script>

<template>
    <div class="w-full">
        <div class="flex flex-col gap-[3px] overflow-y-auto scrollbar-hide">
            <!-- Add bottom margin to last card so it doesn't overlap with basepage footer -->
            <ContentDisplayCard
                v-for="(contentDoc, i) in contentDocs?.docs"
                data-test="content-row"
                :key="contentDoc._id"
                :groups="groups.filter((group) => contentDoc.memberOf?.includes(group._id))"
                :content-doc="contentDoc as ContentDto"
                :parent-type="queryOptions.parentType"
                :language-id="queryOptions.languageId"
                :languages="languages"
                :class="{
                    'mb-48': contentDocs?.docs?.length
                        ? i === contentDocs?.docs?.length - 1
                        : false,
                }"
            />

            <div
                class="flex h-32 w-full items-center justify-center gap-2"
                v-if="!wasContentDocsFound && !loadingContentOverviewContent"
            >
                <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                <p class="text-sm text-zinc-500">No content found with the matched filter.</p>
            </div>
            <div
                class="flex h-32 w-full items-center justify-center gap-2"
                v-if="loadingContentOverviewContent"
            >
                <!-- <LoadingSpinner class="h-4 w-4 text-zinc-500" /> -->
                <LoadingBar class="h-4 w-4 text-zinc-500" />
            </div>
        </div>
    </div>
</template>
