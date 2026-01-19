import { db, type DocType, useDexieLiveQueryWithDeps } from "luminary-shared";
import type { GenericQueryOptions } from "@/components/common/GenericFilter/types";
import type { Ref } from "vue";

export type GenericQueryConfig<T, TCustomFilters = Record<string, unknown>> = {
    docType: DocType;
    searchableFields: (keyof T)[];
    /**
     * Custom filter function or factory.
     * If a factory is provided, it is called once per query execution.
     * Returning a Promise allows for async setup (e.g. pre-fetching data).
     */
    customFilter?:
        | ((doc: T, customFilters: TCustomFilters | undefined) => boolean)
        | ((
              options: GenericQueryOptions<T, TCustomFilters>,
          ) => Promise<(doc: T) => boolean> | ((doc: T) => boolean));
};

/**
 * Generic query function that works with any DTO type
 * Performs basic filtering, searching, sorting, and pagination
 * Reactively watches the options parameter for changes
 * @template T - The DTO type being queried
 * @template TCustomFilters - Optional type for custom filter values
 */
export function genericQuery<T extends { _id: string }, TCustomFilters = Record<string, unknown>>(
    config: GenericQueryConfig<T, TCustomFilters>,
    options: Ref<GenericQueryOptions<T, TCustomFilters>>,
) {
    return useDexieLiveQueryWithDeps(
        options,
        async () => {
            // Apply defaults
            const orderBy = options.value.orderBy || ("updatedTimeUtc" as keyof T);
            const orderDirection = options.value.orderDirection || "desc";
            const pageSize = options.value.pageSize || 20;
            const pageIndex = options.value.pageIndex || 0;

            // Initialize custom filter if it's a factory
            let activeFilter: ((doc: T) => boolean) | undefined;
            if (typeof config.customFilter === "function") {
                const filterResult = config.customFilter(
                    options.value as any,
                    options.value.customFilters as any,
                );
                if (typeof filterResult === "function") {
                    // It's a factory: (options) => filter
                    activeFilter = filterResult as (doc: T) => boolean;
                } else if (filterResult instanceof Promise) {
                    // It's an async factory: (options) => Promise<filter>
                    activeFilter = (await filterResult) as (doc: T) => boolean;
                } else {
                    // It's a simple filter function: (doc, filters) => boolean
                    // Re-wrap it to ensure the correct context
                    activeFilter = (doc) =>
                        (config.customFilter as any)(doc, options.value.customFilters);
                }
            }

            // Start with ordering
            let res = db.docs.orderBy(orderBy as string);
            if (orderDirection === "desc") res = res.reverse();

            // Filter by doc type and apply custom filters
            res = res.filter((doc) => {
                const typedDoc = doc as unknown as T & { type: DocType };

                // Filter by document type
                if (typedDoc.type !== config.docType) return false;

                // Apply search filter across searchable fields
                if (options.value.search && options.value.search.trim() !== "") {
                    const searchTerm = options.value.search.toLowerCase();
                    const matchesSearch = config.searchableFields.some((field) => {
                        const value = typedDoc[field];
                        if (typeof value === "string") {
                            return value.toLowerCase().includes(searchTerm);
                        }
                        return false;
                    });
                    if (!matchesSearch) return false;
                }

                // Apply custom filters if provided
                if (activeFilter && !activeFilter(typedDoc)) {
                    return false;
                }

                return true;
            });

            // Handle count vs data fetch
            if (options.value.count) {
                const count = await res.count();
                return { count };
            } else {
                const docs = await res
                    .offset(pageIndex * pageSize)
                    .limit(pageSize)
                    .toArray();
                return { docs: docs as unknown as T[] };
            }
        },
        { initialValue: { docs: [] as T[] } },
    );
}
