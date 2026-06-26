export type GroupOverviewQueryOptions = {
    search: string;
    orderBy: "relevance" | "name" | "updatedTimeUtc";
    orderDirection: "asc" | "desc";
};
