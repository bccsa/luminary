import type { AclPermission, DocType } from "luminary-shared";

export type GroupOverviewQueryOptions = {
    search: string;
    filterGroupIds: string[];
    filterDocTypes: DocType[];
    filterPermissions: AclPermission[];
    orderBy: "relevance" | "name" | "updatedTimeUtc";
    orderDirection: "asc" | "desc";
};
