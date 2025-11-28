import { MongoSelectorDto } from "./MongoSelectorDto";

/**
 * DTO representing a MongoDB-like / CouchDB MangoQuery query.
 * Supports selector, limit, and sort.
 * Validation is performed using template-based validation in MongoQueryTemplates.
 */
export class MongoQueryDto {
    selector: MongoSelectorDto;

    limit?: number;

    sort?: Array<Record<string, "asc" | "desc">>;

    /** Custom field indicating if it is a CMS query or not */
    cms?: boolean;
}
