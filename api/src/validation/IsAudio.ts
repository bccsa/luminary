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
                        // Check if value exists and has data
                        if (!value || (value.byteLength !== undefined && value.byteLength === 0)) {
                            return false;
                        }

                        // Lazy load music-metadata to avoid module resolution issues in tests
                        const { parseBuffer } = await import("music-metadata");

                        // Convert value to Uint8Array if it's a Buffer
                        const uint8Array =
                            value instanceof Buffer ? new Uint8Array(value) : new Uint8Array(value);

                        // Parse the audio metadata
                        const metadata = await parseBuffer(uint8Array);

                        // Use robust format detection instead of hardcoded checks
                        const formatInfo = getAudioFormatInfo(metadata);

                        return formatInfo.isValidAudio;
                    } catch (error) {
                        // Validation failed - return false without logging
                        // The validation message will be shown through the decorator's message option
                        return false;
                    }
                },
            },
        });
    };
}
