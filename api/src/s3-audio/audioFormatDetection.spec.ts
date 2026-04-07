import { getAudioFormatInfo, getFormatFromFilename } from "./audioFormatDetection";

describe("Audio Format Detection", () => {
    describe("getFormatFromFilename", () => {
        it("should correctly identify common audio formats", () => {
            expect(getFormatFromFilename("song.mp3")).toEqual({
                ext: "mp3",
                mime: "audio/mpeg",
            });

            expect(getFormatFromFilename("voice.wav")).toEqual({
                ext: "wav",
                mime: "audio/wav",
            });

            expect(getFormatFromFilename("audio.aac")).toEqual({
                ext: "aac",
                mime: "audio/aac",
            });

            expect(getFormatFromFilename("music.ogg")).toEqual({
                ext: "ogg",
                mime: "audio/ogg",
            });

            expect(getFormatFromFilename("podcast.m4a")).toEqual({
                ext: "m4a",
                mime: "audio/mp4",
            });
        });

        it("should handle files without extensions", () => {
            expect(getFormatFromFilename("audio")).toEqual({
                ext: "",
                mime: "application/octet-stream",
            });
        });

        it("should handle unknown extensions", () => {
            expect(getFormatFromFilename("file.xyz")).toEqual({
                ext: "xyz",
                mime: "application/octet-stream",
            });
        });
    });

    describe("getAudioFormatInfo", () => {
        it("should detect format from codec", () => {
            const mockMetadata = {
                format: {
                    codec: "mp3",
                    numberOfChannels: 2,
                },
            };

            const result = getAudioFormatInfo(mockMetadata);
            expect(result.ext).toBe("mp3");
            expect(result.mime).toBe("audio/mpeg");
            expect(result.isValidAudio).toBe(true);
        });

        it("should fallback to container-based detection", () => {
            const mockMetadata = {
                format: {
                    container: "wav",
                    numberOfChannels: 2,
                },
            };

            const result = getAudioFormatInfo(mockMetadata);
            expect(result.ext).toBe("wav");
            expect(result.mime).toBe("audio/wav");
            expect(result.isValidAudio).toBe(true);
        });

        it("should handle flexible container names", () => {
            // Test the includes() logic for flexible matching
            const mockMetadata1 = {
                format: {
                    container: "MPEG Layer III", // should match mp3
                    numberOfChannels: 2,
                },
            };

            const result1 = getAudioFormatInfo(mockMetadata1);
            expect(result1.ext).toBe("mp3");
            expect(result1.isValidAudio).toBe(true);

            const mockMetadata2 = {
                format: {
                    container: "WAVE", // should match wav
                    numberOfChannels: 2,
                },
            };

            const result2 = getAudioFormatInfo(mockMetadata2);
            expect(result2.ext).toBe("wav");
            expect(result2.isValidAudio).toBe(true);
        });

        it("should detect valid audio even for unknown formats", () => {
            const mockMetadata = {
                format: {
                    container: "unknown_format",
                    numberOfChannels: 2, // Has audio channels
                },
            };

            const result = getAudioFormatInfo(mockMetadata);
            expect(result.ext).toBe("bin");
            expect(result.mime).toBe("application/octet-stream");
            expect(result.isValidAudio).toBe(true); // Still valid audio
        });

        it("should reject non-audio files", () => {
            const mockMetadata = {
                format: {
                    container: "unknown_format",
                    numberOfChannels: 0, // No audio channels
                },
            };

            const result = getAudioFormatInfo(mockMetadata);
            expect(result.isValidAudio).toBe(false);
        });

        it("should detect mpeg codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "mpeg", numberOfChannels: 2 } });
            expect(result).toEqual({ ext: "mp3", mime: "audio/mpeg", isValidAudio: true });
        });

        it("should detect pcm codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "pcm", numberOfChannels: 1 } });
            expect(result).toEqual({ ext: "wav", mime: "audio/wav", isValidAudio: true });
        });

        it("should detect aac codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "aac", numberOfChannels: 2 } });
            expect(result).toEqual({ ext: "aac", mime: "audio/aac", isValidAudio: true });
        });

        it("should detect vorbis codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "vorbis", numberOfChannels: 2 } });
            expect(result).toEqual({ ext: "ogg", mime: "audio/ogg", isValidAudio: true });
        });

        it("should detect opus codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "opus", numberOfChannels: 2 } });
            expect(result).toEqual({ ext: "opus", mime: "audio/opus", isValidAudio: true });
        });

        it("should detect flac codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "flac", numberOfChannels: 2 } });
            expect(result).toEqual({ ext: "flac", mime: "audio/flac", isValidAudio: true });
        });

        it("should detect wav codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "wav", numberOfChannels: 1 } });
            expect(result).toEqual({ ext: "wav", mime: "audio/wav", isValidAudio: true });
        });

        it("should detect aac/adts container", () => {
            const result = getAudioFormatInfo({
                format: { container: "adts", numberOfChannels: 2 },
            });
            expect(result).toEqual({ ext: "aac", mime: "audio/aac", isValidAudio: true });
        });

        it("should detect ogg container", () => {
            const result = getAudioFormatInfo({
                format: { container: "ogg", numberOfChannels: 2 },
            });
            expect(result).toEqual({ ext: "ogg", mime: "audio/ogg", isValidAudio: true });
        });

        it("should detect opus container", () => {
            const result = getAudioFormatInfo({
                format: { container: "opus_stream", numberOfChannels: 2 },
            });
            expect(result).toEqual({ ext: "opus", mime: "audio/opus", isValidAudio: true });
        });

        it("should detect flac container", () => {
            const result = getAudioFormatInfo({
                format: { container: "flac_native", numberOfChannels: 2 },
            });
            expect(result).toEqual({ ext: "flac", mime: "audio/flac", isValidAudio: true });
        });

        it("should handle undefined numberOfChannels", () => {
            const result = getAudioFormatInfo({
                format: { container: "unknown", numberOfChannels: undefined },
            });
            expect(result.isValidAudio).toBe(false);
        });

        it("should handle case-insensitive codec", () => {
            const result = getAudioFormatInfo({ format: { codec: "MP3", numberOfChannels: 2 } });
            expect(result.ext).toBe("mp3");
        });

        it("should handle no codec and no container", () => {
            const result = getAudioFormatInfo({
                format: { container: "", numberOfChannels: 1 },
            });
            expect(result.isValidAudio).toBe(true);
            expect(result.ext).toBe("bin");
        });

        it("should detect opus and flac from getFormatFromFilename", () => {
            expect(getFormatFromFilename("track.opus")).toEqual({
                ext: "opus",
                mime: "audio/opus",
            });
            expect(getFormatFromFilename("track.flac")).toEqual({
                ext: "flac",
                mime: "audio/flac",
            });
        });
    });
});
