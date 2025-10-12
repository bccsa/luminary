import { registerDecorator, ValidationOptions, ValidationArguments } from "class-validator";
import { MongoSelectorDto } from "../dto/MongoSelectorDto";

// Central list of valid comparison operators that must only appear under a field name
const COMPARISON_OPERATORS = ["$gt", "$lt", "$gte", "$lte", "$ne", "$in"] as const;

export function IsMongoSelector(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isMongoSelector",
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    return checkFieldCompliance(value);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a valid MongoSelector with compliant fields`;
                },
            },
        });
    };
}

function checkFieldCompliance(value: any): boolean {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const keys = Object.keys(value);
    for (const key of keys) {
        if (key === "$or" || key === "$and") {
            const subSelectors = value[key];
            if (!Array.isArray(subSelectors)) {
                return false;
            }
            for (const subSelector of subSelectors) {
                if (
                    !(subSelector instanceof MongoSelectorDto) ||
                    !checkFieldCompliance(subSelector)
                ) {
                    return false;
                }
            }
            continue;
        }

        // Disallow comparison operators at the selector level; they must be nested under a field name
        if (COMPARISON_OPERATORS.includes(key as (typeof COMPARISON_OPERATORS)[number])) {
            return false;
        }

        const fieldValue = value[key];

        if (typeof fieldValue === "string") continue;
        if (typeof fieldValue === "number") continue;
        if (typeof fieldValue === "boolean") continue;
        if (typeof fieldValue === "undefined") continue;

        if (
            fieldValue &&
            // fieldValue instanceof MongoComparisonCriteriaDto &&
            checkComparisonCriteria(fieldValue)
        ) {
            continue;
        }
        return false;
    }
    return true;
}

function checkComparisonCriteria(value: any): boolean {
    if (typeof value !== "object" || value === null) return false;

    const validOperators = COMPARISON_OPERATORS as unknown as string[];

    for (const key of Object.keys(value)) {
        if (!validOperators.includes(key)) {
            return false;
        }
        const opValue = value[key];

        if (key === "$in") {
            if (!Array.isArray(opValue)) {
                return false;
            }
            for (const v of opValue) {
                if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") {
                    return false;
                }
            }
            continue;
        }

        if (key === "$gt" || key === "$lt" || key === "$gte" || key === "$lte") {
            if (typeof opValue !== "number") {
                return false;
            }
            continue;
        }

        if (
            typeof opValue !== "number" &&
            typeof opValue !== "string" &&
            typeof opValue !== "boolean"
        ) {
            return false;
        }
    }
    return true;
}
