import { registerDecorator } from "class-validator";

export function IsSortOptions() {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isSortOptions",
            target: object.constructor,
            propertyName: propertyName,
            validator: {
                validate(value: Array<{ [key: string]: "desc" | "asc" }>) {
                    if (!Array.isArray(value)) return false;
                    for (const item of value) {
                        if (Object.keys(item).length != 1) return false;
                        if (!(Object.values(item)[0] == "asc" || Object.values(item)[0] == "desc"))
                            return false;
                    }
                    return true;
                },
            },
        });
    };
}
