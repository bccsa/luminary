<!-- 
  EXAMPLE: User Overview Page with Generic Filter Component
  
  This file demonstrates how to use the GenericFilterBar component
  with a simple DTO type (UserDto) using both the generic filter UI
  and the generic query function.
-->

<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import GenericFilterBar from "@/components/common/GenericFilter/GenericFilterBar.vue";
import type {
    GenericFilterConfig,
    GenericQueryOptions,
} from "@/components/common/GenericFilter/types";
import { genericQuery } from "@/utils/genericQuery";
import { DocType, type UserDto } from "luminary-shared";
import { ref } from "vue";
import { isSmallScreen } from "@/globalConfig";

// SHORTHAND MODE - Minimal boilerplate configuration
const userFilterConfig: GenericFilterConfig<UserDto> = {
    // Just pass field keys as strings!
    // Auto-generates labels and sets searchable/sortable to true
    fields: ["name", "email", "updatedTimeUtc"],

    // Optional: Add custom select filters
    selectFilters: [
        {
            key: "status",
            label: "Status",
            options: [
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "all", label: "All" },
            ],
            defaultValue: "all",
        },
    ],

    defaultOrderBy: "updatedTimeUtc",
    defaultOrderDirection: "desc",
    pageSize: 20,
};

// ALTERNATIVE: Mixed mode - combine shorthand with custom config
// const userFilterConfigMixed: GenericFilterConfig<UserDto> = {
//     fields: [
//         'name',  // Shorthand
//         'email', // Shorthand
//         { key: 'role', label: 'User Role', searchable: false, sortable: true }, // Custom
//         { key: 'updatedTimeUtc', label: 'Last Updated', searchable: false, sortable: true }, // Custom
//     ],
//     // ... rest of config
// };

// Initialize query options
const queryOptions = ref<GenericQueryOptions<UserDto>>({
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
    pageSize: 20,
    pageIndex: 0,
    search: "",
    status: "all",
});

// Count query - separate ref for count
const countQueryOptions = ref<GenericQueryOptions<UserDto>>({
    ...queryOptions.value,
    count: true,
});

const usersTotal = genericQuery<UserDto>(
    {
        docType: DocType.User,
        searchableFields: ["name", "email"], // Only search in these fields
        additionalFilters: (doc, options) => {
            // Apply custom status filter
            if (options.status === "all") return true;
            // Assuming UserDto has a 'status' field
            return (doc as any).status === options.status;
        },
    },
    countQueryOptions,
);

// Use the generic query function for data
const users = genericQuery<UserDto>(
    {
        docType: DocType.User,
        searchableFields: ["name", "email"],
        additionalFilters: (doc, options) => {
            if (options.status === "all") return true;
            return (doc as any).status === options.status;
        },
    },
    queryOptions,
);
</script>

<template>
    <BasePage :is-full-width="true" title="User Overview" :should-show-page-title="false">
        <template #internalPageHeader>
            <!-- Generic Filter Bar - Plug and Play! -->
            <GenericFilterBar
                :config="userFilterConfig"
                v-model:query-options="queryOptions"
                :is-small-screen="isSmallScreen"
            />
        </template>

        <!-- Display results -->
        <div class="p-8">
            <div class="mb-4">
                <p class="text-sm text-zinc-500">
                    Total users: {{ usersTotal && "count" in usersTotal ? usersTotal.count : 0 }}
                </p>
            </div>

            <div class="space-y-2">
                <div
                    v-for="user in users?.docs ?? []"
                    :key="user._id"
                    class="rounded border border-zinc-200 p-4"
                >
                    <h3 class="font-semibold">{{ user.name }}</h3>
                    <p class="text-sm text-zinc-600">{{ user.email }}</p>
                </div>
            </div>
        </div>
    </BasePage>
</template>
