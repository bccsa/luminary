export type MongoComparisonCriteria = {
    $gt?: number;
    $lt?: number;
    $gte?: number;
    $lte?: number;
    $ne?: number | string | boolean;
    $in?: Array<number | string | boolean>;
};

/**
 * DTO representing a MongoDB-like / CouchDB MangoQuery selector.
 * Supports logical operators: $or, $and.
 * Field criteria can be equality primitives or comparison objects.
 */
export class MongoSelectorDto {
    // Class validation for MongoSelectorDTO is done in the custom IsMongoSelector decorator which validates the entire structure recursively.
    // Hence, no need for individual property decorators here.

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
