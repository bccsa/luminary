export function getAudioFormatInfo(metadata: any): {
    ext: string;
    mime: string;
    isValidAudio: boolean;
} {
    try {
        // Determine format based on container
        const container = metadata.format.container?.toLowerCase();

        if (container === "mp3" || container === "mpeg") {
            return { ext: "mp3", mime: "audio/mpeg", isValidAudio: true };
        } else if (container === "flac") {
            return { ext: "flac", mime: "audio/flac", isValidAudio: true };
        } else if (container === "wav") {
            return { ext: "wav", mime: "audio/wav", isValidAudio: true };
        } else if (container === "ogg") {
            return { ext: "ogg", mime: "audio/ogg", isValidAudio: true };
        } else if (container === "aac") {
            return { ext: "aac", mime: "audio/aac", isValidAudio: true };
        } else {
            return { ext: "audio", mime: "audio/mpeg", isValidAudio: false };
        }
    } catch (error) {
        return { ext: "audio", mime: "audio/mpeg", isValidAudio: false };
    }
}

export function getFormatFromFilename(filename: string): {
    ext: string;
    mime: string;
} {
    const ext = filename.split(".").pop()?.toLowerCase();

    switch (ext) {
        case "mp3":
            return { ext: "mp3", mime: "audio/mpeg" };
        case "flac":
            return { ext: "flac", mime: "audio/flac" };
        case "wav":
            return { ext: "wav", mime: "audio/wav" };
        case "ogg":
            return { ext: "ogg", mime: "audio/ogg" };
        case "aac":
            return { ext: "aac", mime: "audio/aac" };
        default:
            return { ext: "audio", mime: "audio/mpeg" };
    }
}
