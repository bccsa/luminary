/**
 * Basic document shape - users can extend this via index signature.
 */
export interface MRDocument {
    // MR prefix to avoid name collisions when imported
    _id?: string | number;
    [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Supported MongoDB comparison operators for numeric comparisons */
export type MRComparisonOperator = "$gt" | "$lt" | "$gte" | "$lte" | "$ne";

/** Field criteria may be an equality primitive or a comparison object. */
export type MRFieldCriteria = string | number | boolean | MRComparisonCriteria | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Comparison object { $op: value } */
export interface MRComparisonCriteria {
    [operator: string]: number | string | boolean; // value side kept broad; runtime filters narrow it
}

/** Mongo-like query structure (very small subset). */
export interface MRQuery {
    $or?: MRQuery[];
    $and?: MRQuery[];
    $limit?: number;
    $sort?: Array<Record<string, "asc" | "desc">>; // CouchDB Mango-style sort
    // Allow arbitrary field criteria
    [field: string]: MRFieldCriteria | MRQuery[] | undefined;
}
