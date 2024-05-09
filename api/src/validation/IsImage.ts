import { registerDecorator } from "class-validator";
import * as sharp from "sharp";

export function IsImage() {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isImage",
            target: object.constructor,
            propertyName: propertyName,
            validator: {
                validate(value: any) {
                    sharp(value).metadata((err, metadata) => {
                        if (err) {
                            return false;
                        }
                        return (
                            metadata.format === "jpeg" ||
                            metadata.format === "png" ||
                            metadata.format === "webp"
                        );
                    });

                    return value !== null && value !== undefined;
                },
            },
        });
    };
}
