import { registerDecorator, ValidationOptions, ValidationArguments } from "class-validator";
import { MongoSelectorDto } from "../dto/MongoSelectorDto";
// import { MongoComparisonCriteriaDto } from "../dto/MongoComparisonCriteriaDto";

export function IsMongoSelector(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isMSelector",
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    return value instanceof MongoSelectorDto && checkFieldCompliance(value);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a valid MSelector with compliant fields`;
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

    const validOperators = ["$gt", "$lt", "$gte", "$lte", "$ne", "$in"];

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
