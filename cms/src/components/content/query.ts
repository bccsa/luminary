import { db, DocType, TagType, type Uuid, type ContentDto, PublishStatus } from "luminary-shared";

export type ContentOverviewQueryOptions = {
    languageId: Uuid;
    parentType: DocType.Post | DocType.Tag;
    tagType?: TagType;
    orderBy?: "title" | "updatedTimeUtc" | "publishDate" | "expiryDate";
    orderDirection?: "asc" | "desc";
    translationStatus?: "translated" | "untranslated" | "all";
    publishStatus?: "published" | "scheduled" | "expired" | "draft" | "all";
    pageSize?: number;
    pageIndex?: number;
    tags?: Uuid[];
    search?: string;
};

async function contentOverviewQuery(options: ContentOverviewQueryOptions) {
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

    let res = db.docs.orderBy(options.orderBy);
    if (options.orderDirection == "desc") res = res.reverse();

    return res
        .filter((doc) => {
            const contentDoc = doc as ContentDto;

            // Filter documents by type
            if (!contentDoc.parentId) return false;
            if (contentDoc.type != DocType.Content) return false;
            if (contentDoc.parentType != options.parentType) return false;
            if (options.tagType && contentDoc.tagType != options.tagType) return false;

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
                options.tags.some((tagId) => contentDoc.tags.includes(tagId));
            if (!tagFilter) return false;

            const publishFilter = publishStatusFilter(contentDoc, options);
            if (!publishFilter) return false;

            const searchFilter =
                !options.search ||
                contentDoc.title.toLowerCase().includes(options.search.toLowerCase());
            if (!searchFilter) return false;

            return true;
        })
        .offset(options.pageIndex * options.pageSize) // TODO: This may be improved as described here: https://dexie.org/docs/Collection/Collection.offset()
        .limit(options.pageSize)
        .toArray();
}

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

/**
 * Get a list of content documents for a given parent document type as a Vue Ref
 */
export function contentOverviewQueryAsRef(options: ContentOverviewQueryOptions) {
    return db.toRef<ContentDto[]>(
        () => contentOverviewQuery(options) as unknown as Promise<ContentDto[]>,
        [],
    );
}
