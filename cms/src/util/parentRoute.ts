import { cmsLanguages } from "@/globalConfig";
import { DocType, PostType, TagType } from "luminary-shared";

export type ParentRoutable = {
    parentId: string;
    parentType?: DocType;
    parentPostType?: PostType;
    parentTagType?: TagType;
    language: string /** The language identifier or locale code used to resolve translations for this route. */;
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

    const languageCode = cmsLanguages.value.find((_doc) => _doc._id == doc.language)?.languageCode;
    //This allows us to pass the language down from the database-contained languages, and match a document id to the id of a language, so that it loads in that specific language.
    return {
        name: "edit",
        params: {
            docType: doc.parentType,
            tagOrPostType: typeParam,
            id: doc.parentId,
            languageCode: languageCode, // Injects the locale string (e.g., 'fr') into the URL route parameters to ensure the page loads in the correct language.
        },
    };
}
