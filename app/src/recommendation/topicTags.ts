import { DocType, queryLocal, TagType, type ContentDto, type Uuid } from "luminary-shared";

/**
 * Restrict tag ids to `TagType.Topic`. Categories and audio playlists are attached to
 * much of the corpus, so they must not influence affinity scoring or diversification.
 *
 * If IndexedDB is temporarily unavailable, deliberately fail open: the recommendation
 * feature remains usable and both its write and retrieval paths apply the same fallback.
 */
export async function filterTopicTagIds(tagIds: Uuid[]): Promise<Uuid[]> {
    if (!tagIds.length) return [];

    try {
        const tagContent = await queryLocal<ContentDto>({
            selector: {
                $and: [{ type: DocType.Content }, { parentId: { $in: tagIds } }],
            },
        });
        const topicIds = new Set(
            tagContent
                .filter(
                    (content) =>
                        content.parentType === DocType.Tag &&
                        content.parentTagType === TagType.Topic,
                )
                .map((content) => content.parentId),
        );
        return tagIds.filter((id) => topicIds.has(id));
    } catch {
        return tagIds;
    }
}
