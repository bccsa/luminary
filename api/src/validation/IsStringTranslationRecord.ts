import { registerDecorator } from "class-validator";

export function IsStringTranslationRecord() {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isStringTranslationRecord",
            target: object.constructor,
            propertyName: propertyName,
            validator: {
                validate(value: string) {
                    return typeof value === "string";
                },
            },
        });
    };
}
