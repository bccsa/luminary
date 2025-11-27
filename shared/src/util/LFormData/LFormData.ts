import { v4 as uuidv4 } from "uuid";

type BinaryData = Blob | File | ArrayBuffer | Exclude<ArrayBufferView, SharedArrayBuffer>;

const BINARY_REF_PREFIX = "BINARY_REF-";

export class LFormData extends FormData {
    private fileMap = new Map<string, BinaryData>();
    // Track the last appended object so we can merge subsequent primitive fields into it
    private lastAppendedObject:
        | {
              baseKey: string;
              json: any;
              fileMap: Map<string, BinaryData>;
          }
        | undefined = undefined;

    private isBinary(value: any): value is BinaryData {
        if (value instanceof Blob || value instanceof File || value instanceof ArrayBuffer) {
            return true;
        }
        if (ArrayBuffer.isView(value)) {
            return !(value.buffer instanceof SharedArrayBuffer);
        }
        return false;
    }

    private createBinaryRef(id: string): string {
        return `${BINARY_REF_PREFIX}${id}`;
    }

    private extractBinaries(obj: any): any {
        if (obj === null || typeof obj !== "object") return obj;
        if (this.isBinary(obj)) {
            const id = uuidv4();
            this.fileMap.set(id, obj);
            return this.createBinaryRef(id);
        }

        if (Array.isArray(obj)) {
            return obj.map((item) =>
                this.isBinary(item) || (typeof item === "object" && item !== null)
                    ? this.extractBinaries(item)
                    : item,
            );
        }

        // Process object properties - preserve all types (numbers, booleans, etc.)
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (this.isBinary(value)) {
                const id = uuidv4();
                this.fileMap.set(id, value);
                result[key] = this.createBinaryRef(id);
            } else if (typeof value === "object" && value !== null) {
                result[key] = this.extractBinaries(value);
            } else {
                // Preserve types: numbers stay as numbers, booleans as booleans, strings as strings
                result[key] = value;
            }
        }
        return result;
    }

    append(key: string, value: any, filename?: string): void {
        // If appending a primitive value and we have a recently appended object,
        // merge it into that object's JSON and update the stored reference
        if ((typeof value !== "object" || value === null) && this.lastAppendedObject) {
            // Merge the primitive value into the last appended object's JSON
            this.lastAppendedObject.json[key] = value;

            // Re-append the updated JSON as the LAST entry for this key
            // This ensures the server gets the complete, merged JSON
            // Note: FormData allows duplicate keys, and most parsers use the last value
            const jsonKey = `${this.lastAppendedObject.baseKey}__json`;

            // Use set if available to avoid duplicates, otherwise append
            // @ts-ignore - set is available in newer TypeScript versions / environments
            if (typeof super.set === "function") {
                // @ts-ignore
                super.set(jsonKey, JSON.stringify(this.lastAppendedObject.json));
            } else {
                // @ts-ignore - delete is available in newer TypeScript versions / environments
                if (typeof super.delete === "function") {
                    // @ts-ignore
                    super.delete(jsonKey);
                }
                super.append(jsonKey, JSON.stringify(this.lastAppendedObject.json));
            }

            // Don't append the primitive separately - it's now in the JSON
            // This prevents duplicate/conflicting values
            return;
        }

        // If appending a primitive without a previous object, append normally
        if (typeof value !== "object" || value === null) {
            super.append(key, String(value));
            return;
        }

        // Reset file map for this append
        this.fileMap.clear();

        const cleanedJson = this.extractBinaries(value);

        // Store this object as the last appended object for potential merging
        const fileMapCopy = new Map(this.fileMap);
        this.lastAppendedObject = {
            baseKey: key,
            json: cleanedJson,
            fileMap: fileMapCopy,
        };

        // Append all binaries using their ID in the file key
        // The fileId matches the ID used in the BINARY_REF-{id} string
        this.fileMap.forEach((binary, fileId) => {
            const fileKey = `${key}__file__${fileId}`;

            // Convert binary to Blob
            let blob: Blob;
            if (binary instanceof Blob) {
                blob = binary;
            } else if (binary instanceof ArrayBuffer) {
                blob = new Blob([binary]);
            } else if (
                ArrayBuffer.isView(binary) &&
                !(binary.buffer instanceof SharedArrayBuffer)
            ) {
                blob = new Blob([binary.buffer]);
            } else {
                blob = new Blob([binary as any]);
            }

            super.append(
                fileKey,
                blob,
                filename || (binary instanceof File ? binary.name : "file"),
            );
        });

        // Append cleaned JSON with binary references
        // JSON.stringify preserves number, boolean, and null types
        super.append(`${key}__json`, JSON.stringify(cleanedJson));
    }
}
