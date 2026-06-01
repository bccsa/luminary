/** Predicate function that returns true if a document matches */
export type Predicate = (doc: any) => boolean;

/** Mango query selector structure */
export type MangoSelector = {
    // Combination operators
    $or?: MangoSelector[];
    $and?: MangoSelector[];
    $not?: MangoSelector;
    $nor?: MangoSelector[];
    // Allow arbitrary field criteria
    [field: string]:
        | string
        | number
        | boolean
        | null
        | MangoComparisonCriteria
        | MangoSelector
        | MangoSelector[]
        | undefined;
};

/** Mango query structure */
export type MangoQuery = {
    selector: MangoSelector;
    $limit?: number;
    $sort?: Array<Record<string, "asc" | "desc">>; // CouchDB Mango-style sort
    /**
     * Optional CouchDB index hint forwarded to the API as `use_index`. Pick the
     * name of a design doc whose leading indexed field matches your `$sort`.
     * The API validator allowlists a hard-coded set of permitted names.
     */
    use_index?: string;
};

/** Comparison object { $op: value } */
export type MangoComparisonCriteria = {
    // Equality operators
    $eq?: unknown;
    $ne?: unknown;
    // Numeric comparison operators
    $gt?: number | string;
    $lt?: number | string;
    $gte?: number | string;
    $lte?: number | string;
    // Array operators
    $in?: unknown[];
    $nin?: unknown[];
    $all?: unknown[];
    $elemMatch?: MangoSelector;
    $allMatch?: MangoSelector;
    $size?: number;
    // Object operators
    $exists?: boolean;
    $type?: "null" | "boolean" | "number" | "string" | "array" | "object";
    $keyMapMatch?: MangoSelector;
    // String/pattern operators
    $regex?: string;
    $beginsWith?: string;
    // Numeric operators
    $mod?: [number, number];
};
