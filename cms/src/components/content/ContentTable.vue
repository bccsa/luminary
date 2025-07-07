<script setup lang="ts">
import { type ContentDto, type GroupDto, type LanguageDto, DocType, db } from "luminary-shared";
import { contentOverviewQuery, type ContentOverviewQueryOptions } from "./query";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import ContentDisplayCard from "./ContentDisplayCard.vue";

type Props = {
    queryOptions: ContentOverviewQueryOptions;
    groups: GroupDto[];
    contentDocsTotal?: number;
};
const props = defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const contentDocs = contentOverviewQuery(props.queryOptions);
</script>

<template>
    <div class="w-full pt-2">
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
                    'mb-20': contentDocs?.docs?.length
                        ? i === contentDocs?.docs?.length - 1
                        : false,
                }"
            />

            <div
                class="flex h-32 w-full items-center justify-center gap-2"
                v-if="(contentDocs?.docs && contentDocs?.docs.length < 1) || !contentDocs?.docs"
            >
                <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                <p class="text-sm text-zinc-500">No content found with the matched filter.</p>
            </div>
        </div>
    </div>
</template>
