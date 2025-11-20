import { v4 as uuidv4 } from "uuid";

type BinaryData = Blob | File | ArrayBuffer | Exclude<ArrayBufferView, SharedArrayBuffer>;

const BINARY_REF_PREFIX = "BINARY_REF-";

export class LFormData extends FormData {
    private fileMap = new Map<string, BinaryData>();

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

        // Process object properties
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                continue; // Prevent prototype pollution
            }

            if (this.isBinary(value)) {
                const id = uuidv4();
                this.fileMap.set(id, value);
                result[key] = this.createBinaryRef(id);
            } else if (typeof value === "object" && value !== null) {
                result[key] = this.extractBinaries(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    append(key: string, value: any, filename?: string): void {
        if (typeof value !== "object" || value === null) {
            super.append(key, String(value));
            return;
        }

        // Reset file map for this append
        this.fileMap.clear();

        const cleanedJson = this.extractBinaries(value);

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
        super.append(`${key}__json`, JSON.stringify(cleanedJson));
    }
}
