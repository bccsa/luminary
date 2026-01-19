import {
    db,
    DocType,
    TagType,
    type Uuid,
    type ContentDto,
    PublishStatus,
    PostType,
    useDexieLiveQuery,
} from "luminary-shared";
import { ref } from "vue";

export type ContentOverviewQueryOptions = {
    languageId: Uuid;
    parentType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
    orderBy?: "title" | "updatedTimeUtc" | "publishDate" | "expiryDate";
    orderDirection?: "asc" | "desc";
    translationStatus?: "translated" | "untranslated" | "all";
    publishStatus?: "published" | "scheduled" | "expired" | "draft" | "all";
    pageSize?: number;
    pageIndex?: number;
    tags?: Uuid[];
    groups?: Uuid[];
    search?: string;
    count?: boolean;
};

export const loadingContentOverviewContent = ref(false);

export const contentOverviewQuery = (options: ContentOverviewQueryOptions) => {
    loadingContentOverviewContent.value = true;
    return useDexieLiveQuery(async () => {
        if (!options.orderBy) options.orderBy = "updatedTimeUtc";
        if (!options.orderDirection) options.orderDirection = "desc";
        if (!options.pageSize) options.pageSize = 20;
        if (!options.pageIndex) options.pageIndex = 0;
        if (!options.translationStatus) options.translationStatus = "all";
        if (!options.publishStatus) options.publishStatus = "all";

        const translated = (await db.docs // This may slow down the query if there are many documents, but it is necessary to be able to include and filter on untranslated documents
            .where({ type: DocType.Content, language: options.languageId })
            .toArray()) as ContentDto[];
        const untranslatedByParentId: Uuid[] = [];

        // Pre-fetch search matches for tags and groups if searching
        let matchingTagIds: Uuid[] = [];
        let matchingGroupIds: Uuid[] = [];
        if (options.search) {
            const searchLower = options.search.toLowerCase();

            // Find tags matching search
            const matchingTags = await db.docs
                .where({ type: DocType.Content, parentType: DocType.Tag })
                .filter((doc) => (doc as ContentDto).title?.toLowerCase().includes(searchLower))
                .toArray();
            matchingTagIds = matchingTags.map((t) => (t as ContentDto).parentId);

            // Find groups matching search
            const matchingGroups = await db.docs
                .where({ type: DocType.Group })
                .filter((doc) => (doc as any).name?.toLowerCase().includes(searchLower)) // GroupDto usually has name or title? Using 'name' based on typical schema, but need to check. ContentOverview uses 'group.name'? No 'group.title'?
                .toArray();
            // Wait, ContentOverview maps groups: `label: group.name`?
            // Let's check ContentOverview lines 228-241.
            matchingGroupIds = matchingGroups.map((g) => g._id);
        }

        let res = db.docs.orderBy(options.orderBy);
        if (options.orderDirection == "desc") res = res.reverse();

        res = res.filter((doc) => {
            const contentDoc = doc as ContentDto;
            // Filter documents by type
            if (!contentDoc.parentId) return false;
            if (contentDoc.type != DocType.Content) return false;
            if (contentDoc.parentType != options.parentType) return false;
            if (
                contentDoc.parentType == DocType.Tag &&
                contentDoc.parentTagType != options.tagOrPostType
            )
                return false;
            if (
                contentDoc.parentType == DocType.Post &&
                contentDoc.parentPostType != options.tagOrPostType
            )
                return false;

            const translationFilter = translationStatusFilter(
                contentDoc,
                options,
                translated,
                untranslatedByParentId,
            );
            if (!translationFilter) return false;

            const tagFilter =
                !options.tags ||
                options.tags.length == 0 ||
                options.tags.some((tagId) => contentDoc.parentTags.includes(tagId));
            if (!tagFilter) return false;

            const groupFilter =
                !options.groups ||
                options.groups.length == 0 ||
                options.groups.some((groupId) => contentDoc.memberOf.includes(groupId));
            if (!groupFilter) return false;

            const publishFilter = publishStatusFilter(contentDoc, options);
            if (!publishFilter) return false;

            const searchFilter = (() => {
                if (!options.search) return true;
                const searchLower = options.search.toLowerCase();

                // Matches title
                if (contentDoc.title.toLowerCase().includes(searchLower)) return true;

                // Matches tags
                if (
                    matchingTagIds.length > 0 &&
                    contentDoc.parentTags?.some((tagId) => matchingTagIds.includes(tagId))
                ) {
                    return true;
                }

                // Matches groups
                if (
                    matchingGroupIds.length > 0 &&
                    contentDoc.memberOf?.some((groupId) => matchingGroupIds.includes(groupId))
                ) {
                    return true;
                }

                return false;
            })();
            if (!searchFilter) return false;

            return true;
        });

        if (options.count) {
            const count = await res.count();
            return { count };
        } else {
            const docs = await res
                .offset(options.pageIndex * options.pageSize) // TODO: This may be improved as described here: https://dexie.org/docs/Collection/Collection.offset()
                .limit(options.pageSize)
                .toArray();
            return { docs };
        }
    });
};

/**
 * Filter by translation status
 */
function translationStatusFilter(
    doc: ContentDto,
    options: ContentOverviewQueryOptions,
    translated: ContentDto[],
    untranslatedByParent: Uuid[],
) {
    // Filter by translation status
    if (options.translationStatus == "translated") return doc.language == options.languageId;

    if (options.translationStatus == "all" && doc.language == options.languageId) return true;

    const isTranslated = translated.some((translatedDoc) => translatedDoc.parentId == doc.parentId);

    if (options.translationStatus == "untranslated" && isTranslated) return false;

    // Include only the first content doc of another language if the document is not translated to the preferred language
    if (!isTranslated && !untranslatedByParent.includes(doc.parentId)) {
        untranslatedByParent.push(doc.parentId);
        return true;
    }

    return false;
}

/**
 * Filter by calculated publish status
 */
function publishStatusFilter(doc: ContentDto, options: ContentOverviewQueryOptions) {
    const now = new Date().getTime();
    if (options.publishStatus == "all") return true;

    // when filtering by publish status, we need to exclude documents that are not translated to the preferred language
    if (doc.language != options.languageId) return false;

    if (options.publishStatus == "published")
        return (
            doc.status == PublishStatus.Published &&
            doc.publishDate &&
            doc.publishDate <= now &&
            (!doc.expiryDate || doc.expiryDate > now)
        );
    if (options.publishStatus == "scheduled")
        return doc.status == PublishStatus.Published && doc.publishDate && doc.publishDate > now;
    if (options.publishStatus == "expired")
        return doc.status == PublishStatus.Published && doc.expiryDate && doc.expiryDate <= now;
    if (options.publishStatus == "draft") return doc.status == PublishStatus.Draft;
}
