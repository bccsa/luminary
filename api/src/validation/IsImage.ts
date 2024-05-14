import { registerDecorator } from "class-validator";
import * as sharp from "sharp";

export function IsImage() {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isImage",
            target: object.constructor,
            propertyName: propertyName,
            validator: {
                async validate(value: any) {
                    const metadata = await sharp(value).metadata();

                    return (
                        metadata.format === "jpeg" ||
                        metadata.format === "png" ||
                        metadata.format === "webp"
                    );
                },
            },
        });
    };
}
