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
    /**
     * Suppresses the API's unexpired filter on Content queries so docs whose `expiryDate` has
     * already passed come back. Needed by callers that must react to the expiry itself — an
     * expired doc is otherwise simply absent, which is indistinguishable from one that never
     * existed. The API still minimizes such docs before sending them (see stripExpiredContent),
     * so the response carries identity and scheduling fields only, not the body.
     */
    includeExpired?: boolean;
    /**
     * Observability label forwarded to the API's expensive-query logging. Defaults to
     * `"hybridQuery"`; set it to tell one caller's traffic apart from another's in API logs.
     * Not validated server-side against any known set.
     */
    identifier?: string;
    /**
     * Document fields the API should drop from every returned doc, so a caller that never reads a
     * heavy field (`text`, `fts`, …) does not pay to download it. Remote-only — the local Dexie
     * read is unaffected. The API rejects the fields it reads itself (`_id`, `type`,
     * `updatedTimeUtc`, `status`, `expiryDate`); older API versions ignore the key and return
     * full docs.
     */
    omitFields?: string[];
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
