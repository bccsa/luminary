import { db, DocType, TagType, type TagDto, type Uuid } from "luminary-shared";

/**
 * Restrict tag ids to `TagType.Topic`. Categories and audio playlists are attached to
 * much of the corpus, so they must not influence affinity scoring or diversification.
 *
 * If IndexedDB is temporarily unavailable, deliberately fail open: the recommendation
 * feature remains usable and both its write and retrieval paths apply the same fallback.
 */
export async function filterTopicTagIds(tagIds: Uuid[]): Promise<Uuid[]> {
    try {
        const tags = await db.docs.bulkGet(tagIds);
        return tagIds.filter(
            (_, i) => tags[i]?.type === DocType.Tag && (tags[i] as TagDto).tagType === TagType.Topic,
        );
    } catch {
        return tagIds;
    }
}
