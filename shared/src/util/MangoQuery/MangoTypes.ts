/** Mango query selector structure */
export type MangoSelector = {
    $or?: MangoSelector[];
    $and?: MangoSelector[];
    // Allow arbitrary field criteria
    [field: string]:
        | string
        | number
        | boolean
        | MangoComparisonCriteria
        | MangoSelector[]
        | undefined;
};

/** Mango query structure */
export type MangoQuery = {
    selector: MangoSelector;
    $limit?: number;
    $sort?: Array<Record<string, "asc" | "desc">>; // CouchDB Mango-style sort
};

/** Comparison object { $op: value } */
export type MangoComparisonCriteria = {
    $gt?: number;
    $lt?: number;
    $gte?: number;
    $lte?: number;
    $ne?: number | string | boolean;
    $in?: Array<number | string | boolean>;
    $exists?: boolean;
    $elemMatch?: Record<string, unknown>;
};
