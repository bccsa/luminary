<script setup lang="ts">
import { DocType, type RedirectDto, useHybridQueryWithState } from "luminary-shared";
import LCard from "../common/LCard.vue";
import RedirectRow from "./RedirectRow.vue";
const { output: redirects, hasLocalChanges } = useHybridQueryWithState<RedirectDto>(
    () => ({ selector: { type: DocType.Redirect } }),
    { live: true },
);
</script>

<template>
    <LCard padding="none">
        <div class="overflow-x-auto rounded-md">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200 dark:divide-slate-700">
                    <thead class="bg-zinc-50 dark:bg-slate-900">
                        <tr>
                            <!-- From Slug -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:pl-6"
                                @click="false"
                            >
                                From slug
                            </th>

                            <!-- To Slug -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:pl-6"
                            >
                                To slug
                            </th>

                            <!-- Redirect Type -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:pl-6"
                                @click="false"
                            >
                                Type
                            </th>

                            <!-- status -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:pl-6"
                                @click="false"
                            ></th>

                            <!-- updated -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Last updated</div>
                            </th>

                            <!-- actions -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:pl-6"
                            ></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        <RedirectRow
                            v-for="redirect in redirects"
                            :key="redirect._id"
                            :redirectDoc="redirect"
                            :has-local-changes="hasLocalChanges"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
