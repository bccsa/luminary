<script setup lang="ts">
import { type ContentDto, type GroupDto, type LanguageDto, DocType, db } from "luminary-shared";
import { contentOverviewQuery, type ContentOverviewQueryOptions } from "./query";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import LPaginator from "../common/LPaginator.vue";
import ContentDisplayCard from "./ContentDisplayCard.vue";

type Props = {
    isSmallScreen: boolean;
    queryOptions: ContentOverviewQueryOptions;
    groups: GroupDto[];
};
const props = defineProps<Props>();

const pageIndex = defineModel<number>("pageIndex", {
    required: true,
});

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const contentDocs = contentOverviewQuery(props.queryOptions);
const contentDocsTotal = contentOverviewQuery({ ...props.queryOptions, count: true });
</script>

<template>
    <div>
        <div class="flex flex-col gap-1">
            <ContentDisplayCard
                v-for="contentDoc in contentDocs?.docs"
                :is-small-screen="isSmallScreen"
                data-test="content-row"
                :key="contentDoc._id"
                :groups="groups.filter((group) => contentDoc.memberOf?.includes(group._id))"
                :content-doc="contentDoc as ContentDto"
                :parent-type="queryOptions.parentType"
                :language-id="queryOptions.languageId"
                :languages="languages"
            />

            <div
                class="flex h-32 w-full items-center justify-center gap-2"
                v-if="(contentDocs?.docs && contentDocs?.docs.length < 1) || !contentDocs?.docs"
            >
                <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                <p class="text-sm text-zinc-500">No content found with the matched filter.</p>
            </div>
        </div>
        <div class="mt-10 flex h-14 w-full items-center justify-center py-4 md:my-0">
            <LPaginator
                :amountOfDocs="contentDocsTotal?.count as number"
                v-model:index="pageIndex"
                v-model:page-size="queryOptions.pageSize as number"
                variant="extended"
            />
        </div>
    </div>
</template>
