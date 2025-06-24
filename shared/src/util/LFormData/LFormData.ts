import * as _ from "lodash";

type Binary = Blob | File | ArrayBuffer | Exclude<ArrayBufferView, SharedArrayBuffer>;

export class LFormData extends FormData {
    /**
     * This method check if a value is binary data that is compatible with a BlobPart/Blob and FormData
     * @param value the value to check if it is binary data or not
     * @returns
     */
    private isBinary(value: any): value is Binary {
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

        // parentObj and parentKey track the place to delete in the parent's object
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
                            // Delete the entire field holding this object from the parent
                            delete parentObj[parentKey];
                        } else {
                            // If no parent, delete this binary field itself
                            delete value[key];
                        }
                        // We do NOT return here, continue scanning other fields
                    } else if (typeof val === "object" && val !== null) {
                        find(val, value, key);
                    }
                }
            }
        };

        find(json);
        return results;
    }

    append(key: string, value: any) {
        if (typeof value === "object") {
            let fileKey: string;
            // Get the files inside of the json(if any), extract it, and append it to the FormData object
            const files = this.extractAnyFile(value);
            if (files.length > 0) {
                // Iterate over the binary data and append it to the FormData instance
                files.forEach((file, index) => {
                    fileKey = `${index}-${key}-files`;
                    Object.entries(file).forEach(([k, v]) => {
                        // Each child key attached to fileKey to keep track of images for their perspective
                        // sibling fields. For Example: 0-key-files.fileName belongs with 0-key-files.fileData
                        const valueKey = `${fileKey}.${k}`;
                        if (
                            typeof v === "string" ||
                            typeof v === "boolean" ||
                            typeof v === "number"
                        ) {
                            super.append(valueKey, String(v));
                        } else if (k === "fileData" && this.isBinary(v)) {
                            const blob = new Blob([v as BlobPart], {
                                type: "image/octet-stream",
                            });
                            super.append(valueKey, blob, k);
                        }
                    });
                });
            }

            super.append(`${key}-JSON`, JSON.stringify(value));
        } else {
            super.append(key, String(value));
        }

        return this;
    }
}
