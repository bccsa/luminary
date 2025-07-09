type BinaryData = Blob | File | ArrayBuffer | Exclude<ArrayBufferView, SharedArrayBuffer>;

/**
 * LFormData extends the FormData class to handle binary data and JSON objects.
 * It allows appending binary data (Blob, File, ArrayBuffer) and JSON objects
 * while extracting any binary files from the JSON object and appending them
 * to the FormData instance.
 * This allows us to easily make use of multipart/form-data requests
 * while still being able to send complex JSON objects with binary data.
 */
export class LFormData extends FormData {
    /**
     * This method check if a value is binary data that is compatible with a BlobPart/Blob and FormData
     * @param value the value to check if it is binary data or not
     * @returns
     */
    private isBinary(value: any): value is BinaryData {
        if (value instanceof Blob || value instanceof File || value instanceof ArrayBuffer) {
            return true;
        }
        if (ArrayBuffer.isView(value)) {
            // Exclude SharedArrayBuffer-backed views as it is not compatible with BlobPart
            // and cannot be used in FormData
            return !(value.buffer instanceof SharedArrayBuffer);
        }
        return false;
    }
    /**
     * This method extracts any file(and it's metadata) from a JSON object.
     * It searches through the object recursively and returns an array of file data objects.
     * A file data object is any object that contains a field with binary data
     * @param json object to search inside of for files
     * @returns
     */
    private extractAnyFile(json: Object) {
        if (!json || typeof json !== "object") {
            throw new Error("Input must be an object");
        }

        const results: any[] = [];
        const seen = new WeakSet();
        const pathsToDelete: Array<{ parent: any; key: string | number }> = [];

        const find = (value: any, parentObj?: any, parentKey?: string | number) => {
            if (!value || typeof value !== "object") return;
            if (seen.has(value)) return;
            seen.add(value);

            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    find(value[i], value, i);
                }
            } else {
                for (const [key, val] of Object.entries(value)) {
                    if (this.isBinary(val)) {
                        results.push(value);
                        if (parentObj && parentKey !== undefined) {
                            pathsToDelete.push({ parent: parentObj, key: parentKey });
                        } else {
                            pathsToDelete.push({ parent: value, key });
                        }
                    } else if (typeof val === "object" && val !== null) {
                        find(val, value, key);
                    }
                }
            }
        };

        find(json);
        // Remove all found binary fields after collecting
        for (const { parent, key } of pathsToDelete) {
            delete parent[key];
        }
        return results;
    }

    append(key: string, value: any) {
        if (typeof value === "object") {
            let fileKey: string;
            // Work on a deep clone to avoid mutating the original
            const valueClone = { ...value };
            const files = this.extractAnyFile(valueClone);
            if (files.length > 0) {
                let fileName: string;
                files.forEach((file, index) => {
                    fileKey = `${index}-${key}-files`;
                    Object.entries(file).forEach(([k, v]) => {
                        if (k == "filename") fileName = v as string;
                        const valueKey = `${fileKey}-${k}`;
                        if (
                            typeof v === "string" ||
                            typeof v === "boolean" ||
                            typeof v === "number"
                        ) {
                            super.append(valueKey, String(v));
                        } else if (k === "fileData" && this.isBinary(v)) {
                            const blob = new Blob([v as BlobPart], {
                                type: "application/octet-stream",
                            });
                            super.append(valueKey, blob, fileName);
                        }
                    });
                });
            }
            super.append(`${key}-JSON`, JSON.stringify(valueClone));
        } else {
            super.append(key, String(value));
        }
        return this;
    }
}
