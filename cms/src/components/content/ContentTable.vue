<script setup lang="ts">
import { type GroupDto, type LanguageDto, DocType, db } from "luminary-shared";
import ContentRow from "./ContentRow.vue";
import LCard from "../common/LCard.vue";
import { contentOverviewQueryAsRef, type ContentOverviewQueryOptions } from "./query";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";

type Props = {
    queryOptions: ContentOverviewQueryOptions;
    groups: GroupDto[];
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
                            <!-- groups -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            >
                                Groups
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
                        <!-- Decided to rather use upper-level groups from props so the query doesn't have to rerun for each row to reduce load -->
                        <ContentRow
                            v-for="contentDoc in contentDocs"
                            data-test="content-row"
                            :key="contentDoc._id"
                            :groups="
                                groups.filter((group) => contentDoc.memberOf.includes(group._id))
                            "
                            :contentDoc="contentDoc"
                            :parentType="queryOptions.parentType"
                            :languageId="queryOptions.languageId"
                            :languages="languages"
                        />
                    </tbody>
                </table>
                <div
                    class="flex h-32 w-full items-center justify-center gap-2"
                    v-if="contentDocs.length < 1"
                >
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                    <p class="text-sm text-zinc-500">No content found with the matched filter.</p>
                </div>
            </div>
        </div>
    </LCard>
</template>
