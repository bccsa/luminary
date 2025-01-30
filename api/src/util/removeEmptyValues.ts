/**
 * Deep cleans an up an object by removing all keys with null or undefined values.
 */
export function removeEmptyValues(obj: any): any {
    for (const key in obj) {
        if (obj[key] == null || obj[key] == undefined) {
            delete obj[key];
        } else {
            if (typeof obj[key] === "object") {
                removeEmptyValues(obj[key]);
            }
        }
    }
}
