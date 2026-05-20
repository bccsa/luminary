import { DocType, PostType, TagType } from "luminary-shared";

export type ParentRoutable = {
    parentId: string;
    parentType?: DocType;
    parentPostType?: PostType;
    parentTagType?: TagType;
};

/**
 * Builds the edit route for a content document's parent (post or tag), or
 * undefined when the parent type is unknown.
 */
export function parentRoute(doc: ParentRoutable) {
    if (!doc.parentType) return undefined;

    const typeParam =
        doc.parentType === DocType.Post
            ? (doc.parentPostType ?? PostType.Blog)
            : (doc.parentTagType ?? TagType.Category);

    return {
        name: "edit",
        params: {
            docType: doc.parentType,
            tagOrPostType: typeParam,
            id: doc.parentId,
        },
    };
}
