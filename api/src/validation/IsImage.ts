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
                    try {
                        const metadata = await sharp(value).metadata();

                        // Allow any format that Sharp can process as an image
                        // This includes: jpeg, png, webp, gif, tiff, avif, heif, etc.
                        return !!metadata.format && !!metadata.width && !!metadata.height;
                    } catch (error) {
                        // If Sharp can't process it, it's not a valid image
                        return false;
                    }
                },
                defaultMessage: () => {
                    return "File must be a valid image format that can be processed by the image handler";
                },
            },
        });
    };
}
