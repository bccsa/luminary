/**
 * A single highlight, stored inline inside a UserContentDto.highlights array.
 * The `id` is unique within the parent doc and is what lets the server perform
 * merge-on-write across concurrent device edits (union by id, never lost).
 */
export type HighlightEntry = {
    id: string;
    color: string;
    text: string;
    position: number;
    createdAt: number;
};
