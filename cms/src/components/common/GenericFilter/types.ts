// Core TypeScript types for the generic filter system with shorthand mode support

export type FilterFieldConfig<T> = {
    key: keyof T;
    label: string;
    searchable?: boolean;
    sortable?: boolean;
};

export type FilterSelectOption<TValue = string> = {
    value: TValue;
    label: string;
};

export type FilterSelectConfig<TValue = string> = {
    key: string;
    label: string;
    options: FilterSelectOption<TValue>[];
    defaultValue?: TValue;
};

// SHORTHAND MODE: Accept strings OR full objects
export type GenericFilterConfig<T> = {
    fields: (keyof T | FilterFieldConfig<T>)[];
    selectFilters?: FilterSelectConfig[];
    defaultOrderBy?: keyof T;
    defaultOrderDirection?: "asc" | "desc";
    pageSize?: number;
};

// Output query structure
export type GenericQueryOptions<T> = {
    search?: string;
    orderBy?: keyof T;
    orderDirection?: "asc" | "desc";
    pageSize?: number;
    pageIndex?: number;
    count?: boolean;
    [key: string]: unknown; // For custom select filters
};

// Convert camelCase to Title Case
function camelToTitleCase(str: string): string {
    return str
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
}

// Normalize field configuration: convert string keys to full config objects
export function normalizeFieldConfig<T>(
    field: keyof T | FilterFieldConfig<T>,
): FilterFieldConfig<T> {
    // Check if it's already a full config object
    if (typeof field === "object" && field !== null && "key" in field) {
        return field as FilterFieldConfig<T>;
    }
    // Shorthand mode: auto-generate config with smart defaults
    return {
        key: field as keyof T,
        label: camelToTitleCase(String(field)),
        searchable: true,
        sortable: true,
    };
}
