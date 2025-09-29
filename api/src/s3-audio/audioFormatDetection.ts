/**
 * More robust audio format detection using music-metadata
 * This reduces hardcoding by using the actual metadata structure
 */
export function getAudioFormatInfo(metadata: any): {
    ext: string;
    mime: string;
    isValidAudio: boolean;
} {
    const format = metadata.format;

    // music-metadata provides more reliable format detection
    if (format.codec) {
        switch (format.codec.toLowerCase()) {
            case "mp3":
            case "mpeg":
                return { ext: "mp3", mime: "audio/mpeg", isValidAudio: true };
            case "pcm":
            case "wav":
                return { ext: "wav", mime: "audio/wav", isValidAudio: true };
            case "aac":
                return { ext: "aac", mime: "audio/aac", isValidAudio: true };
            case "vorbis":
                return { ext: "ogg", mime: "audio/ogg", isValidAudio: true };
            case "opus":
                return { ext: "opus", mime: "audio/opus", isValidAudio: true };
            case "flac":
                return { ext: "flac", mime: "audio/flac", isValidAudio: true };
        }
    }

    // Fallback to container-based detection (current approach)
    const container = (format.container || "").toLowerCase();
    if (container.includes("wav") || container.includes("wave")) {
        return { ext: "wav", mime: "audio/wav", isValidAudio: true };
    }
    if (container.includes("mpeg") || container.includes("mp3")) {
        return { ext: "mp3", mime: "audio/mpeg", isValidAudio: true };
    }
    if (container.includes("aac") || container.includes("adts")) {
        return { ext: "aac", mime: "audio/aac", isValidAudio: true };
    }
    if (container.includes("ogg")) {
        return { ext: "ogg", mime: "audio/ogg", isValidAudio: true };
    }
    if (container.includes("opus")) {
        return { ext: "opus", mime: "audio/opus", isValidAudio: true };
    }
    if (container.includes("flac")) {
        return { ext: "flac", mime: "audio/flac", isValidAudio: true };
    }

    // Check if it has audio tracks (even if we don't recognize the format)
    const hasAudioTrack = format.numberOfChannels && format.numberOfChannels > 0;

    return {
        ext: "bin",
        mime: "application/octet-stream",
        isValidAudio: !!hasAudioTrack, // Convert to boolean
    };
}

/**
 * Get file extension and MIME type from filename
 */
export function getFormatFromFilename(filename: string): { ext: string; mime: string } {
    const parts = filename.split(".");
    if (parts.length <= 1) {
        return { ext: "", mime: "application/octet-stream" };
    }

    const ext = parts.pop()!.toLowerCase();
    const mimeMap: Record<string, string> = {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        aac: "audio/aac",
        ogg: "audio/ogg",
        opus: "audio/opus",
        flac: "audio/flac",
        m4a: "audio/mp4",
    };

    return {
        ext,
        mime: mimeMap[ext] || "application/octet-stream",
    };
}
