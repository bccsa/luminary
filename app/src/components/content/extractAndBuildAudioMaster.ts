import { Parser } from "m3u8-parser";

/**
 * Extracts and builds an audio master playlist from a given HLS manifest URL.
 *
 * @param {string} originalUrl - The URL of the original HLS manifest file.
 * @param {Object} selectedTrack - Optional object with label and/or language of the track to mark as default
 * @returns {Promise<string>} - A Promise that resolves to the generated audio master playlist as a string.
 */
export const extractAndBuildAudioMaster = async (
    originalUrl: string,
    selectedTrack?: { label?: string; language?: string } | null,
): Promise<string> => {
    // Fetch the original HLS manifest
    const response = await fetch(originalUrl);

    // Read the manifest file content as text.
    const manifestText = await response.text();

    // Parse the manifest using m3u8-parser
    const parser = new Parser();

    // Push the manifest text into the parser for processing.
    parser.push(manifestText);

    // Finalize the parsing process.
    parser.end();

    // Retrieve the parsed manifest object from the parser.
    const parsedManifest = parser.manifest;

    // Get the directory of the manifest for resolving relative URIs
    const manifestDir = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);

    // Extract audio media groups and playlists from the manifest
    const audioMedia = parsedManifest.mediaGroups?.AUDIO || {};

    // Ensure audio media groups are in the expected format
    const playlists = parsedManifest.playlists || [];

    // Initialize an array to store the lines of the new audio master playlist.
    const lines: string[] = ["#EXTM3U", "#EXT-X-VERSION:4", "#EXT-X-INDEPENDENT-SEGMENTS"];

    // Map to store the mapping of audio group/name to CHANNELS value (e.g., "2" for stereo, "1" for mono)
    const channelMap = new Map<string, string>();

    // Extract CHANNELS values from raw text
    // Extract all #EXT-X-MEDIA lines and parse out GROUP-ID, NAME, and CHANNELS attributes
    const mediaLines = manifestText.split("\n").filter((line) => line.startsWith("#EXT-X-MEDIA"));
    for (const line of mediaLines) {
        const groupIdMatch = /GROUP-ID="([^"]+)"/.exec(line);
        const nameMatch = /NAME="([^"]+)"/.exec(line);
        const channelsMatch = /CHANNELS="([^"]+)"/.exec(line);

        // If all attributes are found, store the CHANNELS value in the channelMap using "group|name" as the key
        if (groupIdMatch && nameMatch && channelsMatch) {
            const key = `${groupIdMatch[1]}|${nameMatch[1]}`;
            channelMap.set(key, channelsMatch[1]);
        }
    }

    // Iterate through each audio group in the media groups.
    for (const group in audioMedia) {
        const variants = audioMedia[group];

        // Iterate through each audio variant in the group.
        for (const name in variants) {
            const track: any = (variants as Record<string, typeof track>)[name];

            // Check if the audio track has a URI defined.
            if (track.uri) {
                // Resolve the absolute URI of the audio track.
                const absoluteTrackUri = new URL(track.uri, manifestDir).toString();

                // Normalize name and group for consistent keying (e.g., remove extra spaces)
                const normalize = (val: string) => val.trim().toLowerCase();
                const channelKey = `${normalize(group)}|${normalize(name)}`;

                // Find the matching entry in the channelMap for this group/name
                const matchedChannel = Array.from(channelMap.entries()).find(([key]) => {
                    return key.trim().toLowerCase() === channelKey;
                });

                // If a matching CHANNELS value is found, assign it to the track
                if (matchedChannel) {
                    track.channels = matchedChannel[1];
                }

                // Determine if this track should be the default based on selectedTrack parameter
                let isDefault = track.default;
                let isAutoSelect = track.autoselect;

                if (selectedTrack) {
                    const langMatch = track.language === selectedTrack.language;
                    const labelMatch =
                        track.label === selectedTrack.label || name === selectedTrack.label;

                    if (langMatch || labelMatch) {
                        // This is the selected track - mark it as default
                        isDefault = true;
                        isAutoSelect = true;
                    } else {
                        // Not the selected track - ensure it's not default
                        isDefault = false;
                        isAutoSelect = false;
                    }
                }

                // Add an EXT-X-MEDIA tag for the audio track to the playlist.
                const mediaAttributes = [
                    `TYPE=AUDIO`,
                    `GROUP-ID="${group}"`,
                    track.channels !== undefined && track.channels !== null
                        ? `CHANNELS="${String(track.channels)}"`
                        : null,
                    `NAME="${name}"`,
                    `LANGUAGE="${track.language}"`,
                    `DEFAULT=${isDefault ? "YES" : "NO"}`,
                    `AUTOSELECT=${isAutoSelect ? "YES" : "NO"}`,
                    `URI="${absoluteTrackUri}"`,
                ].filter(Boolean); // Remove nulls

                // Join the attributes into a single string
                lines.push(`#EXT-X-MEDIA:${mediaAttributes.join(",")}`);

                // Get the original relative URI (without query params)
                const relativeTrackUri = track.uri.split("?")[0];

                // Find the matching playlist for this audio group
                const matched = playlists.find(
                    (p) =>
                        p.attributes?.AUDIO === group && (p as any).uri?.includes(relativeTrackUri),
                );

                // Infer bandwidth based on group name
                // Use the channels attribute if available, otherwise assume stereo
                const channels = track.channels ? String(track.channels) : "2";
                const isStereo = channels === "2";
                const isMono = channels === "1";

                const bandwidth =
                    matched?.attributes?.BANDWIDTH ??
                    (isStereo ? 96000 : isMono ? 48000 : 96000 + Math.floor(Math.random() * 64000));

                // Use the matched playlist's codecs or a default value
                const codecs =
                    typeof matched?.attributes?.CODECS === "string"
                        ? matched.attributes.CODECS
                        : "mp4a.40.2";

                // Add the EXT-X-STREAM-INF line for this audio track
                const streamInfLine = `#EXT-X-STREAM-INF:AUDIO="${group}",BANDWIDTH=${bandwidth},CODECS="${codecs}"`;

                lines.push(streamInfLine);
                lines.push(absoluteTrackUri);
            }
        }
    }

    // Join all lines to form the final playlist string
    return lines.join("\n");
};
