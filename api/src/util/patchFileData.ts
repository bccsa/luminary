import { isDangerousKey } from "./removeDangerousKeys";

const BINARY_REF_PREFIX = "BINARY_REF-";

/**
 * Recursively find binary references and replace them with file buffers
 * This function patches binary data back into the JSON structure where LFormData binary references exist
 */
export function patchFileData(obj: any, fileMap: Map<string, Buffer>, baseKey: string): void {
    const isBinaryRef = (value: any): value is string => {
        return typeof value === "string" && value.startsWith(BINARY_REF_PREFIX);
    };

    const extractId = (ref: string): string => {
        return ref.substring(BINARY_REF_PREFIX.length);
    };

    const patch = (value: any): any => {
        if (value === null || typeof value !== "object") {
            // Check if it's a binary reference string
            if (isBinaryRef(value)) {
                // Extract the ID from "BINARY_REF-{id}" and use it to find the file
                // The file key format is: ${baseKey}__file__{id}
                const fileId = extractId(value);
                const fileKey = `${baseKey}__file__${fileId}`;
                return fileMap.get(fileKey) || null;
            }
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((item) => patch(item));
        }

        const result: any = {};
        for (const key of Object.keys(value)) {
            // Skip dangerous prototype pollution keys
            if (isDangerousKey(key)) {
                continue;
            }

            const val = value[key];
            result[key] = patch(val);
        }
        return result;
    };

    // Patch the object in place
    const patched = patch(obj);
    Object.keys(obj).forEach((key) => delete obj[key]);
    Object.assign(obj, patched);
}
