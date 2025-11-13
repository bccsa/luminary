/**
 * YouTube URL utilities for CMS
 */

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

    const regex =
        /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

/**
 * Gets YouTube video thumbnail URL
 * @param url - The YouTube URL
 * @param quality - Thumbnail quality ('default', 'medium', 'high', 'standard', 'maxres')
 * @returns Thumbnail URL or null
 */
export function getYouTubeThumbnail(
    url: string,
    quality: "default" | "medium" | "high" | "standard" | "maxres" = "high",
): string | null {
    const videoId = extractYouTubeId(url);
    if (!videoId) return null;

    const qualityMap = {
        default: "default.jpg",
        medium: "mqdefault.jpg",
        high: "hqdefault.jpg",
        standard: "sddefault.jpg",
        maxres: "maxresdefault.jpg",
    };

    return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}`;
}
