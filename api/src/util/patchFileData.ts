import { isDangerousKey } from "./removeDangerousKeys";

/**
 * Recursively find placeholders and replace them with file objects using __fileId and __path
 * This function patches binary data back into the JSON structure where LFormData placeholders exist
 */
export function patchFileData(
    obj: any,
    fileMap: Map<string, { data: Buffer; metadata: Record<string, any> }>,
    baseKey: string,
): void {
    let fileIndex = 0;

    const isPlaceholder = (value: any): value is { __fileId: string; __path: string[] } => {
        return value && typeof value === "object" && value.__fileId && Array.isArray(value.__path);
    };

    const patch = (value: any): any => {
        if (!value || typeof value !== "object") return value;

        // Check if this value itself is a placeholder
        if (isPlaceholder(value)) {
            const fileKey = `${baseKey}__file__${fileIndex++}`;
            const fileInfo = fileMap.get(fileKey);

            if (fileInfo) {
                // Combine metadata with binary data
                return {
                    ...fileInfo.metadata,
                    fileData: fileInfo.data,
                };
            }
            // If file not found, return null as fallback
            return null;
        }

        if (Array.isArray(value)) {
            return value.map((item) => {
                if (isPlaceholder(item)) {
                    const fileKey = `${baseKey}__file__${fileIndex++}`;
                    const fileInfo = fileMap.get(fileKey);

                    if (fileInfo) {
                        return {
                            ...fileInfo.metadata,
                            fileData: fileInfo.data,
                        };
                    }
                    return null;
                } else if (typeof item === "object" && item !== null) {
                    return patch(item);
                }
                return item;
            });
        }

        const result: any = {};
        for (const key of Object.keys(value)) {
            // Skip dangerous prototype pollution keys
            if (isDangerousKey(key)) {
                continue;
            }

            const val = value[key];
            if (isPlaceholder(val)) {
                const fileKey = `${baseKey}__file__${fileIndex++}`;
                const fileInfo = fileMap.get(fileKey);

                if (fileInfo) {
                    result[key] = {
                        ...fileInfo.metadata,
                        fileData: fileInfo.data,
                    };
                } else {
                    result[key] = null;
                }
            } else if (typeof val === "object" && val !== null) {
                result[key] = patch(val);
            } else {
                result[key] = val;
            }
        }
        return result;
    };

    // Patch the object in place
    const patched = patch(obj);
    Object.keys(obj).forEach((key) => delete obj[key]);
    Object.assign(obj, patched);
}
