<script setup lang="ts">
import { db, DocType, type RedirectDto } from "luminary-shared";
import LCard from "../common/LCard.vue";
import RedirectRow from "./RedirectRow.vue";
const redirects = db.whereTypeAsRef<RedirectDto[]>(DocType.Redirect, []);
</script>

<template>
    <LCard padding="none">
        <div class="overflow-x-auto rounded-md">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50">
                        <tr>
                            <!-- From Slug -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                From slug
                            </th>

                            <!-- To Slug -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                            >
                                To slug
                            </th>

                            <!-- Redirect Type -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                Type
                            </th>

                            <!-- status -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            ></th>

                            <!-- updated -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Last updated</div>
                            </th>

                            <!-- actions -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                            ></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-200 bg-white">
                        <RedirectRow
                            v-for="redirect in redirects"
                            :key="redirect._id"
                            :redirectDoc="redirect"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
