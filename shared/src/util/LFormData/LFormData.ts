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
     * It searches through the object recursively and returns an array of file data objects
     * with their paths in the original structure.
     * A file data object is any object that contains a field with binary data
     * @param json object to search inside of for files
     * @returns Array of {path: string, data: object} containing the path and file data
     */
    private extractAnyFile(json: Object) {
        if (!json || typeof json !== "object") {
            throw new Error("Input must be an object");
        }

        const results: Array<{ path: string; data: any }> = [];
        const seen = new WeakSet();

        const find = (value: any, currentPath: string = "") => {
            if (!value || typeof value !== "object") return;
            if (seen.has(value)) return;
            seen.add(value);

            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    const itemPath = `${currentPath}[${i}]`;
                    // Check if this array item contains binary data
                    if (typeof value[i] === "object" && value[i] !== null) {
                        const hasBinary = this.containsBinaryData(value[i]);
                        if (hasBinary) {
                            results.push({ path: itemPath, data: value[i] });
                            value[i] = null; // Mark as extracted
                        } else {
                            find(value[i], itemPath);
                        }
                    }
                }
            } else {
                for (const [key, val] of Object.entries(value)) {
                    const fieldPath = currentPath ? `${currentPath}.${key}` : key;

                    if (typeof val === "object" && val !== null) {
                        const hasBinary = this.containsBinaryData(val);
                        if (hasBinary) {
                            results.push({ path: fieldPath, data: val });
                            delete value[key]; // Mark as extracted
                        } else {
                            find(val, fieldPath);
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

    append(key: string, value: any) {
        if (typeof value === "object") {
            console.log(`LFormData.append called with key="${key}"`);
            console.log(`  value keys:`, Object.keys(value));
            console.log(`  typeof structuredClone:`, typeof structuredClone);

            // Work on a deep clone to avoid mutating the original
            let valueClone;
            try {
                valueClone = structuredClone(value);
                console.log(`  After clone, keys:`, Object.keys(valueClone));
            } catch (e) {
                console.error(`  structuredClone failed:`, e);
                valueClone = JSON.parse(JSON.stringify(value)); // Fallback
                console.log(`  After JSON clone, keys:`, Object.keys(valueClone));
            }

            const files = this.extractAnyFile(valueClone);

            console.log(`  Files found: ${files.length}`);
            files.forEach((f, i) => console.log(`    File ${i}: path="${f.path}"`));

            if (files.length > 0) {
                files.forEach((fileEntry, index) => {
                    const fileKey = `${index}-${key}-files`;
                    const { path, data } = fileEntry;

                    // Store the path so the API can reconstruct the structure
                    super.append(`${fileKey}-path`, path);
                    console.log(`  Appended: "${fileKey}-path" = "${path}"`);

                    // Store all metadata from the file object
                    let fileName: string | undefined;
                    Object.entries(data).forEach(([k, v]) => {
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
