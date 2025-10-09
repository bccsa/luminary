import { IsNotEmpty, IsNumber, IsOptional, IsPositive } from "class-validator";
import { MongoSelectorDto } from "./MongoSelectorDto";
import { IsMongoSelector } from "../validation/IsMongoSelector";
import { IsMongoQuerySortArray } from "../validation/IsMongoQuerySortArray";

/**
 * DTO representing a MongoDB-like / CouchDB MangoQuery query.
 * Supports selector, limit, and sort.
 */
export class MongoQueryDto {
    @IsNotEmpty()
    @IsMongoSelector()
    selector: MongoSelectorDto;

    @IsOptional()
    @IsNumber({ allowNaN: false, maxDecimalPlaces: 0, allowInfinity: false })
    @IsPositive()
    $limit?: number;

    @IsOptional()
    @IsMongoQuerySortArray()
    $sort?: Array<Record<string, "asc" | "desc">>;
}
