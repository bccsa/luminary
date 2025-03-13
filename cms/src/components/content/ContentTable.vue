<script setup lang="ts">
import { type LanguageDto, DocType, db } from "luminary-shared";
import ContentRow from "./ContentRow.vue";
import LCard from "../common/LCard.vue";
import { contentOverviewQueryAsRef, type ContentOverviewQueryOptions } from "./query";

type Props = {
    queryOptions: ContentOverviewQueryOptions;
};
const props = defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const contentDocs = contentOverviewQueryAsRef(props.queryOptions);
</script>

<template>
    <LCard class="rounded-t-none" padding="none">
        <div class="overflow-x-auto">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50">
                        <tr>
                            <!-- title -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Title</div>
                            </th>
                            <!-- status -->
                            <th
                                class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                            ></th>

                            <!-- translations -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            >
                                Translations
                            </th>

                            <!-- tags -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            >
                                Tags
                            </th>

                            <!-- publish date -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            >
                                Publish date
                            </th>

                            <!-- expiry date -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            >
                                Expiry date
                            </th>

                            <!-- updated -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Last updated</div>
                            </th>
                            <!-- actions -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            ></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-200 bg-white">
                        <ContentRow
                            v-for="contentDoc in contentDocs"
                            data-test="content-row"
                            :key="contentDoc._id"
                            :contentDoc="contentDoc"
                            :parentType="queryOptions.parentType"
                            :languageId="queryOptions.languageId"
                            :languages="languages"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
