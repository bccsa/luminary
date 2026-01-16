<script setup lang="ts">
import { db, DocType, type RedirectDto } from "luminary-shared";
import LCard from "../common/LCard.vue";
import RedirectRow from "./RedirectRow.vue";
import { computed, watch } from "vue";
import type { GenericQueryOptions } from "@/components/common/GenericFilter/types";

type Props = {
    queryOptions?: GenericQueryOptions<RedirectDto>;
};

const props = withDefaults(defineProps<Props>(), {
    queryOptions: () => ({ search: "", orderBy: "slug", orderDirection: "asc" }),
});

const emit = defineEmits<{
    "update:total": [value: number];
}>();

const redirects = db.whereTypeAsRef<RedirectDto[]>(DocType.Redirect, []);

// Apply client-side filtering and sorting
const filteredAndSortedRedirects = computed(() => {
    let result = redirects.value || [];

    // Apply search filter
    if (props.queryOptions.search) {
        const searchLower = props.queryOptions.search.toLowerCase();
        result = result.filter(
            (redirect) =>
                redirect.slug?.toLowerCase().includes(searchLower) ||
                redirect.toSlug?.toLowerCase().includes(searchLower) ||
                redirect.redirectType?.toLowerCase().includes(searchLower),
        );
    }

    // Apply sorting
    if (props.queryOptions.orderBy) {
        const orderBy = props.queryOptions.orderBy as keyof RedirectDto;
        const direction = props.queryOptions.orderDirection === "desc" ? -1 : 1;

        result = [...result].sort((a, b) => {
            const aVal = a[orderBy];
            const bVal = b[orderBy];

            if (typeof aVal === "string" && typeof bVal === "string") {
                return direction * aVal.localeCompare(bVal);
            }
            if (typeof aVal === "number" && typeof bVal === "number") {
                return direction * (aVal - bVal);
            }
            return 0;
        });
    }

    return result;
});

// Total count for paginator
const totalRedirects = computed(() => filteredAndSortedRedirects.value.length);

// Emit total count
watch(
    totalRedirects,
    (newTotal) => {
        emit("update:total", newTotal);
    },
    { immediate: true },
);

// Apply pagination
const paginatedRedirects = computed(() => {
    const pageSize = props.queryOptions.pageSize || 20;
    const pageIndex = props.queryOptions.pageIndex || 0;
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    return filteredAndSortedRedirects.value.slice(start, end);
});
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
                            v-for="redirect in paginatedRedirects"
                            :key="redirect._id"
                            :redirectDoc="redirect"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
