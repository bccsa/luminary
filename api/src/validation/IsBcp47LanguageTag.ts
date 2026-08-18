import { registerDecorator } from "class-validator";

export function IsBcp47LanguageTag() {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isBcp47LanguageTag",
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: `${propertyName} must be a valid BCP 47 language tag (e.g. "en", "en-US")`,
            },
            validator: {
                validate(value: any) {
                    if (typeof value !== "string" || !value) return false;
                    try {
                        new Intl.Locale(value);
                        return true;
                    } catch {
                        return false;
                    }
                },
            },
        });
    };
}
