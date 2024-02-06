<script setup lang="ts">
import { ArrowsUpDownIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/vue/20/solid";
import { computed, toRefs } from "vue";

type Column = {
    key: string;
    text?: string;
    sortable?: boolean;
    sortMethod?: (a: Item, b: Item) => number;
};
type Item = any;
type SortDirection = "ascending" | "descending";

type Props = {
    columns: Column[];
    items: Item[];
    sortBy?: string;
    sortDirection?: SortDirection;
    paginate?: boolean;
    itemsPerPage?: number;
    currentPage?: number;
};

const props = withDefaults(defineProps<Props>(), {
    sortDirection: "descending",
    paginate: false,
    itemsPerPage: 25,
    currentPage: 1,
});
const { columns, items, paginate, sortBy, sortDirection, currentPage, itemsPerPage } =
    toRefs(props);

const emit = defineEmits(["update:sortBy", "update:sortDirection", "update:currentPage"]);

function getField(item: Item, columnKey: string) {
    const segments = columnKey.split(".");
    return segments.reduce((obj, key) => obj[key], item);
}

const paginateStart = computed(() => {
    return (currentPage.value - 1) * itemsPerPage.value;
});
const paginateEnd = computed(() => {
    return Math.min(paginateStart.value + itemsPerPage.value, items.value.length);
});

const paginatedItems = computed(() => {
    if (!paginate.value) {
        return sortedItems.value;
    }

    return sortedItems.value.slice(paginateStart.value, paginateEnd.value);
});

const pages = computed(() => {
    return Math.round(items.value.length / itemsPerPage.value);
});

const sortedItems = computed(() => {
    if (sortBy?.value == undefined) {
        return items.value;
    }

    const column = columns.value.find((c) => c.key == sortBy.value);

    if (!column) {
        throw "Sorting by unknown column";
    }

    const sortableItems = [...items.value];

    if (column.sortMethod) {
        return sortableItems.sort(column.sortMethod);
    }

    return sortableItems.sort((a, b) => {
        const firstItem = getField(a, column.key);
        const secondItem = getField(b, column.key);
        if (firstItem < secondItem) return sortDirection.value == "descending" ? 1 : -1;
        if (firstItem > secondItem) return sortDirection.value == "descending" ? -1 : 1;
        return 0;
    });
});

function setCurrentPage(page: number) {
    emit("update:currentPage", page);
}

function sort(column: Column) {
    if (column.sortable === false) {
        return;
    }

    // Stop sorting this column if we have cycled through both sorting directions
    if (sortBy?.value == column.key && sortDirection.value === "descending") {
        emit("update:sortDirection", "descending");
        emit("update:sortBy", undefined);
        return;
    }

    // If the column was already sorted, flip the sort direction
    if (sortBy?.value == column.key) {
        emit("update:sortDirection", "descending");
        return;
    }

    // Reset the sort direction when another column is clicked
    emit("update:sortDirection", "ascending");
    emit("update:sortBy", column.key);
}
</script>

<template>
    <div class="overflow-x-auto">
        <div class="inline-block min-w-full align-middle">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th
                            v-for="(column, index) in columns"
                            :key="column.key"
                            @click="sort(column)"
                            scope="col"
                            class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900"
                            :class="{
                                'sm:pl-6': index == 0,
                                'sm:pl-3': index != 0,
                                'cursor-pointer': column.sortable !== false,
                            }"
                        >
                            <div
                                class="flex items-center gap-2"
                                :class="{
                                    'flex-row-reverse justify-start': index == columns.length - 1,
                                }"
                            >
                                {{ column.text }}

                                <button v-if="column.sortable !== false" aria-label="Sort column">
                                    <ArrowsUpDownIcon
                                        class="h-5 w-5 text-transparent group-hover:text-gray-600"
                                        v-if="sortBy !== column.key"
                                    />
                                    <ArrowUpIcon
                                        class="h-5 w-5 text-gray-600"
                                        v-if="sortBy == column.key && sortDirection == 'ascending'"
                                    />
                                    <ArrowDownIcon
                                        class="h-5 w-5 text-gray-600"
                                        v-if="sortBy == column.key && sortDirection == 'descending'"
                                    />
                                </button>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white">
                    <tr v-for="(item, key) in paginatedItems" :key="key">
                        <td
                            v-for="(column, index) in columns"
                            :key="column.key"
                            class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium"
                            :class="[
                                index == 0 ? 'text-gray-900 sm:pl-6' : 'text-gray-700 sm:pl-3',
                            ]"
                        >
                            <div :class="{ 'flex justify-end': index == columns.length - 1 }">
                                <slot
                                    v-if="$slots[`item.${column.key}`]"
                                    :name="`item.${column.key}`"
                                    v-bind="item"
                                />
                                <span v-else>
                                    {{ getField(item, column.key) }}
                                </span>
                            </div>
                        </td>
                    </tr>
                </tbody>
                <tfoot class="bg-gray-50 text-sm" v-if="paginate">
                    <tr>
                        <td :colspan="columns.length" class="py-3 pl-4 pr-3 sm:pl-6">
                            <div
                                class="flex flex-row-reverse items-center justify-between sm:flex-row"
                            >
                                <div class="text-gray-700">
                                    Showing
                                    <span class="font-medium">{{ paginateStart + 1 }}</span>
                                    to
                                    <span class="font-medium">{{ paginateEnd }}</span>
                                    of
                                    <span class="font-medium">{{ items.length }}</span>
                                    results
                                </div>
                                <div>
                                    <button
                                        v-for="page in pages"
                                        :key="page"
                                        @click="setCurrentPage(page)"
                                        class="page mx-0.5 cursor-pointer rounded px-2.5 py-1 text-gray-800 hover:bg-gray-200 active:bg-gray-300"
                                        :class="{
                                            'bg-gray-200 font-medium text-gray-900 ring-1 ring-inset ring-gray-300/80':
                                                page == currentPage,
                                        }"
                                    >
                                        <span class="sr-only">Go to page</span>
                                        {{ page }}
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>
</template>
