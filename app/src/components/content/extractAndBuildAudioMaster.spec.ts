import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractAndBuildAudioMaster } from "./extractAndBuildAudioMaster";

const MANIFEST_URL = "https://cdn.example.com/media/master.m3u8";

const createManifest = (options: {
    audioGroups?: Array<{
        groupId: string;
        name: string;
        language: string;
        uri: string;
        channels?: string;
        isDefault?: boolean;
    }>;
    playlists?: Array<{
        audio: string;
        uri: string;
        bandwidth?: number;
        codecs?: string;
    }>;
}) => {
    const lines = ["#EXTM3U", "#EXT-X-VERSION:4"];

    for (const track of options.audioGroups || []) {
        const attrs = [
            `TYPE=AUDIO`,
            `GROUP-ID="${track.groupId}"`,
            track.channels ? `CHANNELS="${track.channels}"` : "",
            `NAME="${track.name}"`,
            `LANGUAGE="${track.language}"`,
            `DEFAULT=${track.isDefault ? "YES" : "NO"}`,
            `AUTOSELECT=${track.isDefault ? "YES" : "NO"}`,
            `URI="${track.uri}"`,
        ]
            .filter(Boolean)
            .join(",");
        lines.push(`#EXT-X-MEDIA:${attrs}`);
    }

    for (const pl of options.playlists || []) {
        const attrs = [
            `AUDIO="${pl.audio}"`,
            `BANDWIDTH=${pl.bandwidth || 128000}`,
            pl.codecs ? `CODECS="${pl.codecs}"` : "",
        ]
            .filter(Boolean)
            .join(",");
        lines.push(`#EXT-X-STREAM-INF:${attrs}`);
        lines.push(pl.uri);
    }

    return lines.join("\n");
};

describe("extractAndBuildAudioMaster", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("builds audio master from manifest with one audio group", async () => {
        const manifest = createManifest({
            audioGroups: [
                {
                    groupId: "audio-group",
                    name: "English",
                    language: "en",
                    uri: "audio/en.m3u8",
                    channels: "2",
                },
            ],
            playlists: [
                {
                    audio: "audio-group",
                    uri: "audio/en.m3u8",
                    bandwidth: 96000,
                    codecs: "mp4a.40.2",
                },
            ],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                text: () => Promise.resolve(manifest),
            }),
        );

        const result = await extractAndBuildAudioMaster(MANIFEST_URL);

        expect(result).toContain("#EXTM3U");
        expect(result).toContain("#EXT-X-MEDIA:");
        expect(result).toContain("#EXT-X-STREAM-INF:");
        expect(result).toContain('GROUP-ID="audio-group"');
        expect(result).toContain('NAME="English"');
        expect(result).toContain('LANGUAGE="en"');
        expect(result).toContain('CHANNELS="2"');
    });

    it("resolves relative URIs to absolute based on manifest URL", async () => {
        const manifest = createManifest({
            audioGroups: [
                {
                    groupId: "audio",
                    name: "Track",
                    language: "en",
                    uri: "tracks/audio_en.m3u8",
                },
            ],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                text: () => Promise.resolve(manifest),
            }),
        );

        const result = await extractAndBuildAudioMaster(MANIFEST_URL);

        expect(result).toContain("https://cdn.example.com/media/tracks/audio_en.m3u8");
    });

    it("marks selected track as DEFAULT=YES by language", async () => {
        // Use a raw manifest to ensure correct parsing
        const manifest = [
            "#EXTM3U",
            "#EXT-X-VERSION:4",
            '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="en.m3u8"',
            '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="French",LANGUAGE="fr",DEFAULT=NO,AUTOSELECT=NO,URI="fr.m3u8"',
        ].join("\n");

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                text: () => Promise.resolve(manifest),
            }),
        );

        const result = await extractAndBuildAudioMaster(MANIFEST_URL, {
            language: "fr",
            label: "French",
        });

        const lines = result.split("\n");
        const englishMedia = lines.find((l) => l.includes('NAME="English"'));
        const frenchMedia = lines.find((l) => l.includes('NAME="French"'));

        expect(englishMedia).toContain("DEFAULT=NO");
        expect(frenchMedia).toContain("DEFAULT=YES");
    });

    it("marks selected track as DEFAULT=YES by label", async () => {
        const manifest = createManifest({
            audioGroups: [
                {
                    groupId: "audio",
                    name: "English",
                    language: "en",
                    uri: "en.m3u8",
                },
                {
                    groupId: "audio",
                    name: "French",
                    language: "fr",
                    uri: "fr.m3u8",
                },
            ],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                text: () => Promise.resolve(manifest),
            }),
        );

        const result = await extractAndBuildAudioMaster(MANIFEST_URL, { label: "French" });

        const lines = result.split("\n");
        const frenchMedia = lines.find((l) => l.includes('NAME="French"'));

        expect(frenchMedia).toContain("DEFAULT=YES");
    });

    it("infers bandwidth based on channel count", async () => {
        const manifest = createManifest({
            audioGroups: [
                {
                    groupId: "audio",
                    name: "Stereo",
                    language: "en",
                    uri: "stereo.m3u8",
                    channels: "2",
                },
                {
                    groupId: "audio",
                    name: "Mono",
                    language: "en",
                    uri: "mono.m3u8",
                    channels: "1",
                },
            ],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                text: () => Promise.resolve(manifest),
            }),
        );

        const result = await extractAndBuildAudioMaster(MANIFEST_URL);

        const lines = result.split("\n");
        const stereoStreamInf = lines.find(
            (l, i) => l.includes("STREAM-INF") && lines[i + 1]?.includes("stereo"),
        );
        const monoStreamInf = lines.find(
            (l, i) => l.includes("STREAM-INF") && lines[i + 1]?.includes("mono"),
        );

        expect(stereoStreamInf).toContain("BANDWIDTH=96000");
        expect(monoStreamInf).toContain("BANDWIDTH=48000");
    });

    it("uses matched playlist codecs when available", async () => {
        const manifest = createManifest({
            audioGroups: [
                {
                    groupId: "audio",
                    name: "Track",
                    language: "en",
                    uri: "track.m3u8",
                },
            ],
            playlists: [
                {
                    audio: "audio",
                    uri: "track.m3u8",
                    bandwidth: 64000,
                    codecs: "mp4a.40.5",
                },
            ],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                text: () => Promise.resolve(manifest),
            }),
        );

        const result = await extractAndBuildAudioMaster(MANIFEST_URL);

        expect(result).toContain('CODECS="mp4a.40.5"');
        expect(result).toContain("BANDWIDTH=64000");
    });

    it("handles manifest with no audio groups", async () => {
        const manifest = "#EXTM3U\n#EXT-X-VERSION:4\n";

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                text: () => Promise.resolve(manifest),
            }),
        );

        const result = await extractAndBuildAudioMaster(MANIFEST_URL);

        expect(result).toContain("#EXTM3U");
        expect(result).not.toContain("#EXT-X-MEDIA:");
        expect(result).not.toContain("#EXT-X-STREAM-INF:");
    });
});
