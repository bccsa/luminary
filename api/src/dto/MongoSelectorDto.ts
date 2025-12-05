export type MongoComparisonCriteria = {
    $gt?: number;
    $lt?: number;
    $gte?: number;
    $lte?: number;
    $ne?: number | string | boolean;
    $in?: Array<number | string | boolean>;
    $elemMatch?: MongoComparisonCriteria;
    $exists?: boolean;
};

/**
 * DTO representing a MongoDB-like / CouchDB MangoQuery selector.
 * Supports logical operators: $or, $and.
 * Field criteria can be equality primitives or comparison objects.
 * Validation is performed using template-based validation in MongoQueryTemplates.
 */
export class MongoSelectorDto {
    $or?: MongoSelectorDto[];
    $and?: MongoSelectorDto[];

    // Allow arbitrary field criteria
    [field: string]:
        | string
        | number
        | boolean
        | MongoComparisonCriteria
        | MongoSelectorDto[]
        | undefined;
}
