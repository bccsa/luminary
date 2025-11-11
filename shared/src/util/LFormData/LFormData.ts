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
     * A file data object is any object that contains a field with binary data.
     * The binary data objects are replaced with null in the original structure.
     * @param json object to search inside of for files
     * @returns Array of file data objects
     */
    private extractAnyFile(json: Object) {
        if (!json || typeof json !== "object") {
            throw new Error("Input must be an object");
        }

        const results: any[] = [];
        const seen = new WeakSet();

        const find = (value: any) => {
            if (!value || typeof value !== "object") return;
            if (seen.has(value)) return;
            seen.add(value);

            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    if (typeof value[i] === "object" && value[i] !== null) {
                        const hasBinary = this.containsBinaryData(value[i]);
                        if (hasBinary) {
                            results.push(value[i]);
                            value[i] = null; // Mark as extracted
                        } else {
                            find(value[i]);
                        }
                    }
                }
            } else {
                for (const [key, val] of Object.entries(value)) {
                    if (typeof val === "object" && val !== null) {
                        const hasBinary = this.containsBinaryData(val);
                        if (hasBinary) {
                            results.push(val);
                            value[key] = null; // Replace with null
                        } else {
                            find(val);
                        }
                    }
                }
            }
        };

        find(json);
        return results;
    }

    /**
     * Check if an object or any of its immediate properties contain binary data
     */
    private containsBinaryData(obj: any): boolean {
        if (!obj || typeof obj !== "object") return false;

        for (const val of Object.values(obj)) {
            if (this.isBinary(val)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Deep clone an object while preserving binary data references
     * structuredClone() doesn't work properly with File objects in some environments
     */
    private deepCloneWithBinary(obj: any): any {
        if (obj === null || typeof obj !== "object") return obj;
        if (this.isBinary(obj)) return obj; // Keep binary data as-is

        if (Array.isArray(obj)) {
            return obj.map((item) => this.deepCloneWithBinary(item));
        }

        const cloned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            cloned[key] = this.deepCloneWithBinary(value);
        }
        return cloned;
    }

    append(key: string, value: any) {
        if (typeof value === "object") {
            // Work on a deep clone to avoid mutating the original
            // Note: structuredClone() doesn't work with File objects in test environments
            const valueClone = this.deepCloneWithBinary(value);
            const files = this.extractAnyFile(valueClone);

            if (files.length > 0) {
                files.forEach((fileData, index) => {
                    const fileKey = `${index}-${key}-files`;

                    // Store all metadata from the file object
                    let fileName: string | undefined;
                    Object.entries(fileData).forEach(([k, v]) => {
                        if (k === "filename") fileName = v as string;
                        const valueKey = `${fileKey}-${k}`;

                        if (
                            typeof v === "string" ||
                            typeof v === "boolean" ||
                            typeof v === "number"
                        ) {
                            super.append(valueKey, String(v));
                        } else if (this.isBinary(v)) {
                            const blob = new Blob([v as BlobPart], {
                                type: "application/octet-stream",
                            });
                            super.append(valueKey, blob, fileName || "file");
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
