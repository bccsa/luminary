import { db, type DocType, useDexieLiveQueryWithDeps } from "luminary-shared";
import type { GenericQueryOptions } from "@/components/common/GenericFilter/types";
import type { Ref } from "vue";

export type GenericQueryConfig<T> = {
    docType: DocType;
    searchableFields: (keyof T)[];
    additionalFilters?: (doc: T, options: GenericQueryOptions<T>) => boolean;
};

/**
 * Generic query function that works with any DTO type
 * Performs basic filtering, searching, sorting, and pagination
 * Reactively watches the options parameter for changes
 */
export function genericQuery<T extends { _id: string }>(
    config: GenericQueryConfig<T>,
    options: Ref<GenericQueryOptions<T>>,
) {
    return useDexieLiveQueryWithDeps(
        options,
        async () => {
            // Apply defaults
            const orderBy = options.value.orderBy || ("updatedTimeUtc" as keyof T);
            const orderDirection = options.value.orderDirection || "desc";
            const pageSize = options.value.pageSize || 20;
            const pageIndex = options.value.pageIndex || 0;

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

                // Apply additional custom filters if provided
                if (
                    config.additionalFilters &&
                    !config.additionalFilters(typedDoc, options.value)
                ) {
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
