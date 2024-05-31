<script setup lang="ts">
import { db } from "@/db/baseDatabase";
import { DocType, type PostDto, type TagDto } from "@/types";
import ContentRow from "./ContentRow.vue";
import { ArrowsUpDownIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/vue/20/solid";
import LCard from "../common/LCard.vue";

type Props = {
    editLinkName: string;
    docType: DocType.Post | DocType.Tag;
};

const props = defineProps<Props>();

const contentParents = db.whereTypeAsRef<PostDto[] | TagDto[]>(props.docType, []);
</script>

<template>
    <LCard padding="none">
        <div class="overflow-x-auto">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50">
                        <tr>
                            <!-- title -->
                            <th
                                class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">
                                    Title
                                    <button aria-label="Sort column">
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
                                class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">
                                    Last updated
                                    <button aria-label="Sort column">
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
                            v-for="contentParent in contentParents"
                            :key="contentParent._id"
                            :parent="contentParent"
                            :parentType="DocType.Post"
                            language="lang-swa"
                            :editLinkName="editLinkName"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
