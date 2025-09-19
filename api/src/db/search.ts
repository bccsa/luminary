// helper functions for searching the database

import { DocType, Uuid } from "../enums";

export type SearchOptions = {
    userAccess: Map<DocType, Uuid[]>; // Map of document types and the user's access to them
    types?: Array<DocType>;
    groups?: Array<string>;
    from?: number;
    to?: number;
    limit?: number;
    sort?: Array<{ [key: string]: "asc" | "desc" }>;
    offset?: number;
    contentOnly?: boolean;
    queryString?: string;
    languages?: string[];
    docId?: Uuid;
    slug?: string;
    parentId?: string;
};

/**
 * Calculate the list of group memberships. If a list of group memberships is passed, only include the group memberships requested (e.g. for incremental sync of newly added access). Else include all the user available group memberships.
 * @param docType
 * @returns
 */
export const calcGroups = (docType: DocType, options: SearchOptions) => {
    return options.groups && options.groups.length > 0
        ? options.groups.filter((group) => options.userAccess[docType]?.indexOf(group) > -1)
        : options.userAccess[docType];
};
