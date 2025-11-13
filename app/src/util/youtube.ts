/**
 * Detects if a URL is a YouTube video URL
 * @param url - The URL to check
 * @returns boolean indicating if it's a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
    if (!url) return false;

    const youtubeRegex =
        /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    return youtubeRegex.test(url);
}

/**
 * Extracts YouTube video ID from various YouTube URL formats
 * @param url - The YouTube URL
 * @returns YouTube video ID or null if invalid
 */
export function extractYouTubeId(url: string): string | null {
    if (!url) return null;

    // Match YouTube URL formats and extract video ID
    const regex =
        /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

/**
 * Converts a YouTube URL to the format expected by VideoJS YouTube plugin
 * @param url - The original YouTube URL
 * @returns VideoJS-compatible YouTube URL
 */
export function convertToVideoJSYouTubeUrl(url: string): string {
    const videoId = extractYouTubeId(url);
    if (!videoId) return url; // Return original if not a valid YouTube URL

    // add options for youtube
    return `https://www.youtube.com/watch?v=${videoId}`;
}
