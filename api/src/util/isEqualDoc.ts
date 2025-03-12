import { isDeepStrictEqual } from "util";
import { removeEmptyValues } from "./removeEmptyValues";

/**
 * Compare two documents for equality disregarding the _rev, updatedTimeUtc and updatedBy fields
 * @param doc1
 * @param doc2
 */
export function isEqualDoc(doc1: any, doc2: any) {
    if (!doc1 || !doc2) return false;

    const doc1Copy = { ...doc1 };
    const doc2Copy = { ...doc2 };

    removeEmptyValues(doc1Copy);
    removeEmptyValues(doc2Copy);
    delete doc1Copy._rev;
    delete doc1Copy.updatedTimeUtc;
    delete doc2Copy._rev;
    delete doc2Copy.updatedTimeUtc;
    delete doc1Copy.updatedBy;
    delete doc2Copy.updatedBy;

    return isDeepStrictEqual(doc1Copy, doc2Copy);
}
