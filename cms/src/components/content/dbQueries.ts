import { db, DocType, TagType, type Uuid, type ContentDto } from "luminary-shared";

export type ContentOverviewQueryOptions = {
    preferredLanguageId: Uuid;
    parentDocType: DocType.Post | DocType.Tag;
    tagType?: TagType;
    orderBy?: "publishDate" | "title" | "updatedTimeUtc";
    orderDirection?: "asc" | "desc";
    translationStatus: "translated" | "untranslated";
    pageSize?: number;
    pageIndex?: number;
};

function contentOverviewQuery(options: ContentOverviewQueryOptions) {
    if (!options.orderBy) options.orderBy = "updatedTimeUtc";
    if (!options.orderDirection) options.orderDirection = "desc";
    if (!options.pageSize) options.pageSize = 20;
    if (!options.pageIndex) options.pageIndex = 0;

    const contentDocParentList: Uuid[] = [];

    let collection = db.docs.orderBy(options.orderBy);

    if (options.orderDirection == "desc") collection = collection.reverse();

    collection = collection.filter((doc) => {
        // Filter documents by type
        if (doc.type != DocType.Content) return false;
        if (doc.parentType != options.parentDocType) return false;
        if (options.tagType && doc.tagType != options.tagType) return false;

        // Filter by preferred language
        if (options.translationStatus == "translated") {
            return doc.language == options.preferredLanguageId;
        }

        // Ensure that only the first content doc for each parent is included
        if (!contentDocParentList.includes(doc.parentId)) {
            contentDocParentList.push(doc.parentId);
            return true;
        }
        return false;
    });

    return collection
        .offset(options.pageIndex * options.pageSize) // TODO: This may be improved as described here: https://dexie.org/docs/Collection/Collection.offset()
        .limit(options.pageSize)
        .toArray();
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
