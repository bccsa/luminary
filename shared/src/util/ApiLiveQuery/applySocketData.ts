import { Ref } from "vue";
import { ApiSearchQuery } from "../../rest/RestApi";
import {
    ApiQueryResult,
    BaseDocumentDto,
    ContentDto,
    DeleteCmdDto,
    DocType,
    RedirectDto,
} from "../../types";
import { db } from "../../db/database";

/**
 * Apply an array of items to an array by _id. If the item already exists in the array, it will be updated.
 */
function updateArray<T extends BaseDocumentDto>(array: Array<T>, items: Array<T>) {
    items.forEach((item) => {
        const index = array.findIndex((i) => i._id === item._id);
        if (index !== -1) {
            array[index] = item;
        } else {
            array.push(item);
        }
    });
}

/**
 * Apply the data from the socket to the destination array after filtering it based on the query.
 */
export function applySocketData<T extends BaseDocumentDto>(
    data: ApiQueryResult<T>,
    destination: Ref<Array<T> | undefined>,
    query: ApiSearchQuery,
) {
    // Delete documents that are marked for deletion
    const toDeleteIds = (data.docs as unknown as Array<DeleteCmdDto>)
        .filter((doc) => {
            if (doc.type !== DocType.DeleteCmd) return false;

            return db.validateDeleteCommand(doc);
        })
        .map((doc) => doc.docId);

    destination.value = destination.value?.filter(
        (doc) => !toDeleteIds.includes(doc._id),
    ) as Array<T>;

    // Filter out delete commands from the result
    let docs = data.docs.filter((doc) => doc.type !== DocType.DeleteCmd);

    // Filter on document type
    if (query.types && query.types.length > 0) {
        if (
            query.contentOnly &&
            (query.types.includes(DocType.Post) || query.types.includes(DocType.Tag))
        ) {
            docs = docs.filter(
                (doc) =>
                    doc.type === DocType.Content &&
                    doc.parentType &&
                    query.types?.includes(doc.parentType),
            );
        } else {
            docs = docs.filter(
                (doc) =>
                    query.types?.includes(doc.type) ||
                    (doc.type === DocType.Content &&
                        doc.parentType &&
                        query.types?.includes(doc.parentType)),
            );
        }
    }

    // Filter on language
    if (query.languages && query.languages.length > 0) {
        docs = docs.filter(
            (doc) =>
                doc.type !== DocType.Content ||
                query.languages?.includes((doc as unknown as ContentDto).language),
        );
    }

    if (query.from) docs = docs.filter((doc) => doc.updatedTimeUtc >= query.from!);
    if (query.to) docs = docs.filter((doc) => doc.updatedTimeUtc <= query.to!);
    if (query.docId) docs = docs.filter((doc) => doc._id === query.docId);
    if (query.slug) {
        docs = docs.filter((doc) => {
            const typedDoc = doc as unknown as RedirectDto | ContentDto;
            return typedDoc.slug === query.slug;
        });
    }
    if (query.parentId) {
        docs = docs.filter((doc) => {
            const typedDoc = doc as unknown as ContentDto;
            return typedDoc.parentId === query.parentId;
        });
    }

    // If limit or offset is set, only update already existing documents
    if (query.limit || query.offset) {
        docs = docs.filter((doc) => destination.value?.some((d) => d._id === doc._id));
    }

    // Update the ref
    if (docs.length && !destination.value) {
        destination.value = docs;
    } else {
        updateArray(destination.value, docs);
    }

    // Sorting
    if (!query.sort || !query.sort.length) {
        // Default to updatedTimeUtc descending order if no sort is provided
        destination.value.sort((a, b) => {
            return b.updatedTimeUtc - a.updatedTimeUtc;
        });

        return;
    }

    query.sort.forEach((sort) => {
        const key = Object.keys(sort)[0];
        const order = sort[key];

        if (!destination.value) return;
        destination.value.sort((a, b) => {
            const _a = a as any;
            const _b = b as any;

            if (!_a[key] || !_b[key]) return 0; // Skip if key is not present

            if (order === "asc") {
                if (_a[key] < _b[key]) return -1;
                if (_a[key] > _b[key]) return 1;
            } else {
                if (_a[key] < _b[key]) return 1;
                if (_a[key] > _b[key]) return -1;
            }

            return 0;
        });
    });
}
