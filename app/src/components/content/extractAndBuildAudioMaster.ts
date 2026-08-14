import { Parser } from "m3u8-parser";

/** Audio codec to claim when the master names none. */
const DEFAULT_AUDIO_CODEC = "mp4a.40.2";
/** Bandwidth to claim when no variant states one. */
const DEFAULT_AUDIO_BANDWIDTH = 96000;
/**
 * Version to declare when the master omits one. 7, not 4: these playlists use
 * `#EXT-X-MAP` (fMP4), which requires 6 or higher, and a version that understates
 * what the playlist contains is grounds for a strict player to reject it.
 */
const DEFAULT_VERSION = 7;

type AudioTrack = {
    name: string;
    uri: string;
    language?: string;
    channels?: string;
    default?: boolean;
    autoselect?: boolean;
};

/** The audio half of a CODECS list — "avc1.64001f,mp4a.40.2" → "mp4a.40.2". */
function audioCodec(codecs?: string): string | undefined {
    return codecs
        ?.split(",")
        .map((c) => c.trim())
        .find((c) => c.startsWith("mp4a") || c.startsWith("ac-3") || c.startsWith("ec-3"));
}

/**
 * Extracts and builds an audio-only master playlist from an HLS manifest.
 *
 * One `#EXT-X-STREAM-INF` per audio *group*, not per track. Emitting one per track
 * makes every track a variant while they all still declare the same `AUDIO` group,
 * so a player picks one playlist as its variant and separately plays the group's
 * default rendition — two audio streams for one ear, which stalls playback rather
 * than merely sounding wrong. The renditions belong in `#EXT-X-MEDIA` only; the
 * variant exists to name the group.
 *
 * @param originalUrl - URL of the original HLS master.
 * @param selectedTrack - Track to mark DEFAULT, by label and/or language.
 * @returns The generated audio-only master playlist.
 */
export const extractAndBuildAudioMaster = async (
    originalUrl: string,
    selectedTrack?: { label?: string; language?: string } | null,
): Promise<string> => {
    const response = await fetch(originalUrl);
    const manifestText = await response.text();

    const parser = new Parser();
    parser.push(manifestText);
    parser.end();
    const parsedManifest = parser.manifest;

    // Resolve every URI against the master, so the result stands alone as a data: URL.
    const manifestDir = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);

    const audioMedia = parsedManifest.mediaGroups?.AUDIO || {};
    const playlists = parsedManifest.playlists || [];

    // CHANNELS is not modeled by the parser, so it is read from the raw text.
    const channelMap = new Map<string, string>();
    for (const line of manifestText.split("\n").filter((l) => l.startsWith("#EXT-X-MEDIA"))) {
        const group = /GROUP-ID="([^"]+)"/.exec(line);
        const name = /NAME="([^"]+)"/.exec(line);
        const channels = /CHANNELS="([^"]+)"/.exec(line);
        if (group && name && channels) {
            channelMap.set(
                `${group[1].trim().toLowerCase()}|${name[1].trim().toLowerCase()}`,
                channels[1],
            );
        }
    }

    const version = Number(/#EXT-X-VERSION:(\d+)/.exec(manifestText)?.[1]) || DEFAULT_VERSION;

    const lines: string[] = ["#EXTM3U", `#EXT-X-VERSION:${version}`, "#EXT-X-INDEPENDENT-SEGMENTS"];
    const variantLines: string[] = [];

    for (const group in audioMedia) {
        const variants = audioMedia[group];

        const tracks: AudioTrack[] = [];
        for (const name in variants) {
            const track: any = (variants as Record<string, any>)[name];
            if (!track.uri) continue;
            tracks.push({
                name,
                uri: new URL(track.uri, manifestDir).toString(),
                language: track.language,
                channels: channelMap.get(`${group.trim().toLowerCase()}|${name.trim().toLowerCase()}`),
                default: track.default,
                autoselect: track.autoselect,
            });
        }
        if (tracks.length === 0) continue;

        // Which track the player should start on.
        const chosen = selectedTrack
            ? tracks.find(
                  (t) =>
                      (selectedTrack.language && t.language === selectedTrack.language) ||
                      (selectedTrack.label && t.name === selectedTrack.label),
              )
            : undefined;
        const startTrack = chosen ?? tracks.find((t) => t.default) ?? tracks[0];

        for (const track of tracks) {
            const isDefault = track === startTrack;
            lines.push(
                `#EXT-X-MEDIA:${[
                    "TYPE=AUDIO",
                    `GROUP-ID="${group}"`,
                    track.channels ? `CHANNELS="${track.channels}"` : null,
                    `NAME="${track.name}"`,
                    track.language ? `LANGUAGE="${track.language}"` : null,
                    `DEFAULT=${isDefault ? "YES" : "NO"}`,
                    `AUTOSELECT=${isDefault ? "YES" : "NO"}`,
                    `URI="${track.uri}"`,
                ]
                    .filter(Boolean)
                    .join(",")}`,
            );
        }

        // One variant for the group, pointing at the track playback should start on.
        const matched = playlists.filter((p) => p.attributes?.AUDIO === group);
        const bandwidth =
            Math.max(0, ...matched.map((p) => Number(p.attributes?.BANDWIDTH) || 0)) ||
            DEFAULT_AUDIO_BANDWIDTH;
        const codecs =
            matched
                .map((p) =>
                    typeof p.attributes?.CODECS === "string"
                        ? audioCodec(p.attributes.CODECS)
                        : undefined,
                )
                .find(Boolean) ?? DEFAULT_AUDIO_CODEC;

        variantLines.push(
            `#EXT-X-STREAM-INF:AUDIO="${group}",BANDWIDTH=${bandwidth},CODECS="${codecs}"`,
            startTrack.uri,
        );
    }

    return [...lines, ...variantLines].join("\n");
};
