import { registerDecorator } from "class-validator";
import * as musicMeta from "music-metadata";

export function IsAudio() {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isAudio",
            target: object.constructor,
            propertyName: propertyName,
            validator: {
                async validate(value: any) {
                    try {
                        // value should be a Buffer or readable stream
                        const metadata = await musicMeta.parseBuffer(value);

                        // Check if it's an audio file
                        return (
                            metadata.format.container === "mp3" ||
                            metadata.format.container === "wav" ||
                            metadata.format.container === "ogg" ||
                            metadata.format.container === "aac" ||
                            metadata.format.container === "opus"
                        );
                    } catch {
                        return false;
                    }
                },
            },
        });
    };
}
