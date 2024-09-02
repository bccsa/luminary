<script setup lang="ts">
import { type LanguageDto, DocType, db } from "luminary-shared";
import ContentRow from "./ContentRow.vue";
import { ArrowsUpDownIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/vue/20/solid";
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
    <LCard padding="none">
        <div class="overflow-x-auto rounded-b-md">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50">
                        <tr>
                            <!-- title -->
                            <th
                                class="group cursor-pointer py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">
                                    Title
                                    <button aria-label="Sort column" @click="onSortByTitle">
                                        <ArrowsUpDownIcon
                                            class="h-5 w-5 text-transparent group-hover:text-zinc-600"
                                            v-if="true"
                                        />
                                        <ArrowUpIcon class="h-5 w-5 text-zinc-600" v-if="false" />
                                        <ArrowDownIcon class="h-5 w-5 text-zinc-600" v-if="false" />
                                    </button>
                                </div>
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
                            <!-- updated -->
                            <th
                                class="group cursor-pointer py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">
                                    Last updated
                                    <button aria-label="Sort column" @click="onSortByUpdated">
                                        <ArrowsUpDownIcon
                                            class="h-5 w-5 text-transparent group-hover:text-zinc-600"
                                            v-if="true"
                                        />
                                        <ArrowUpIcon class="h-5 w-5 text-zinc-600" v-if="false" />
                                        <ArrowDownIcon class="h-5 w-5 text-zinc-600" v-if="false" />
                                    </button>
                                </div>
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
                            :key="contentDoc._id"
                            :contentDoc="contentDoc"
                            :parentType="queryOptions.parentType"
                            :languageId="queryOptions.languageId"
                            :languages="languages"
                            :tagType="queryOptions.tagType"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
