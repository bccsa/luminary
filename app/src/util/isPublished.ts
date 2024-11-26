import { type ContentDto } from "luminary-shared";

/**
 * Check if a content item is published
 * @param content - The content document item to check
 * @returns
 */
export function isPublished(content: ContentDto): boolean {
    if (
        !content ||
        content.status !== "published" ||
        !content.publishDate ||
        content.publishDate > Date.now() ||
        (content.expiryDate && content.expiryDate < Date.now())
    ) {
        return false;
    }

    return true;
}
