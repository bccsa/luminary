import { registerDecorator, ValidationOptions } from "class-validator";

export function IsMongoQuerySortArray(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isMQuerySortArray",
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    if (!Array.isArray(value)) return false;
                    return value.every(
                        (item) =>
                            typeof item === "object" &&
                            Object.keys(item).every(
                                (key) => item[key] === "asc" || item[key] === "desc",
                            ),
                    );
                },
                defaultMessage() {
                    return `${propertyName} must be an array of objects with "asc" or "desc" values.`;
                },
            },
        });
    };
}
