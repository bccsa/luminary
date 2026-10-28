/**
 * The minimal document shape HybridQuery needs: `_id` to merge/dedupe and `updatedTimeUtc` to pick
 * the fresher copy. Lets tables other than `docs` (e.g. `userActivity`) use HybridQuery without
 * pretending to be a `BaseDocumentDto`.
 */
export type HybridDoc = {
    _id: string;
    updatedTimeUtc: number;
};
