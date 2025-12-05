/** Mongo-like query selector structure */
export type MongoSelector = {
    $or?: MongoSelector[];
    $and?: MongoSelector[];
    // Allow arbitrary field criteria
    [field: string]:
        | string
        | number
        | boolean
        | MongoComparisonCriteria
        | MongoSelector[]
        | undefined;
};

/** Mongo-like query structure */
export type MongoQuery = {
    selector: MongoSelector;
    $limit?: number;
    $sort?: Array<Record<string, "asc" | "desc">>; // CouchDB Mango-style sort
};

/** Comparison object { $op: value } */
export type MongoComparisonCriteria = {
    $gt?: number;
    $lt?: number;
    $gte?: number;
    $lte?: number;
    $ne?: number | string | boolean;
    $in?: Array<number | string | boolean>;
};
