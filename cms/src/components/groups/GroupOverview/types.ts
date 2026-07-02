export type GroupOverviewQueryOptions = {
    search: string;
    filterGroupIds: string[];
    orderBy: "relevance" | "name" | "updatedTimeUtc";
    orderDirection: "asc" | "desc";
};
