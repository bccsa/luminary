import { HttpException, HttpStatus } from "@nestjs/common";
import { Uuid } from "../enums";
import { MongoComparisonCriteria, MongoSelectorDto } from "../dto/MongoSelectorDto";

/**
 * Extract memberOf groups from the top-level $and array.
 * (After expansion, memberOf will always be a condition in the $and array.
 */
export function extractMemberOf(selector: MongoSelectorDto): Uuid[] {
    for (const condition of selector.$and || []) {
        const memberOf = (condition as MongoSelectorDto).memberOf;
        if (!memberOf) continue;

        if (typeof memberOf === "string") {
            return [memberOf];
        }

        if (Array.isArray((memberOf as MongoComparisonCriteria).$in)) {
            return (memberOf as MongoComparisonCriteria).$in as string[];
        }

        if (Array.isArray((memberOf as MongoComparisonCriteria).$elemMatch?.$in)) {
            return (memberOf as MongoComparisonCriteria).$elemMatch.$in as string[];
        }

        throw new HttpException("Invalid memberOf field in selector", HttpStatus.BAD_REQUEST);
    }

    return [];
}

/**
 * Remove memberOf from conditions in the top-level $and array.
 * (After expansion, memberOf will always be a condition in the $and array.)
 */
export function removeMemberOf(selector: MongoSelectorDto): void {
    if (!selector.$and) return;

    for (const condition of selector.$and) {
        if ((condition as any).memberOf !== undefined) {
            delete (condition as any).memberOf;
        }
    }

    // Remove any conditions that are now empty after memberOf deletion
    selector.$and = selector.$and.filter((condition) => Object.keys(condition).length > 0);
}

/**
 * Extract a field value from the $and array.
 * Returns the first matching value found, or undefined if not present.
 * Throws if multiple different values are found for the same field.
 */
export function extractFieldFromAnd<T>(andArray: MongoSelectorDto[], fieldName: string): T | undefined {
    let foundValue: T | undefined;

    for (const condition of andArray) {
        if (fieldName in condition) {
            const value = condition[fieldName] as T;

            // Only accept simple equality values (string, number, boolean)
            if (
                typeof value !== "string" &&
                typeof value !== "number" &&
                typeof value !== "boolean"
            ) {
                throw new HttpException(
                    `'${fieldName}' field must be a simple equality value`,
                    HttpStatus.BAD_REQUEST,
                );
            }

            if (foundValue !== undefined && foundValue !== value) {
                throw new HttpException(
                    `Multiple different '${fieldName}' values found in selector`,
                    HttpStatus.BAD_REQUEST,
                );
            }

            foundValue = value;
        }
    }

    return foundValue;
}
