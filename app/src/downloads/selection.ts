import type { DownloadSelection } from "@/build-time/contracts/downloads/contract";

/** The key a selection's sizes are found under in `DownloadOptions.sizes`. */
export function selectionKey(selection: DownloadSelection): string {
    if (selection.kind === "video") {
        return `video/${selection.angleId}/${selection.qualityId}/${selection.audioLanguage}`;
    }
    return selection.audioQualityId
        ? `audio/${selection.audioQualityId}/${selection.audioLanguage}`
        : `audio/${selection.audioLanguage}`;
}
