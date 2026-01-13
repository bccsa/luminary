import { registerDecorator } from "class-validator";
import { getAudioFormatInfo } from "../s3-audio/audioFormatDetection";

export function IsAudio() {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isAudio",
            target: object.constructor,
            propertyName: propertyName,
            options: {
                message: `${propertyName} must be a valid audio file (mp3, wav, ogg, aac, opus)`,
            },
            validator: {
                async validate(value: any) {
                    try {
                        // Dynamically import music-metadata to avoid loading it if not needed
                        // @ts-expect-error - music-metadata may not be installed in all environments
                        const mm = await import("music-metadata");
                        const mmEsm = await (mm as any).parserBuffer();
                        // value should be a Buffer or readable stream
                        const metadata = await mmEsm.parseBuffer(new Uint8Array(value));

                        // Use robust format detection instead of hardcoded checks
                        const formatInfo = getAudioFormatInfo(metadata);
                        return formatInfo.isValidAudio;
                    } catch {
                        return false;
                    }
                },
            },
        });
    };
}
