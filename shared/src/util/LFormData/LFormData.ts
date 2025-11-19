import { v4 as uuidv4 } from "uuid";

type BinaryData = Blob | File | ArrayBuffer | Exclude<ArrayBufferView, SharedArrayBuffer>;

const PLACEHOLDER_SYMBOL = Symbol("LFormDataPlaceholder");

interface FilePlaceholder {
    [PLACEHOLDER_SYMBOL]: true;
    __fileId: string;
    __path: string[];
}

export class LFormData extends FormData {
    private fileMap = new Map<string, { data: BinaryData; metadata: Record<string, any> }>();

    private isBinary(value: any): value is BinaryData {
        if (value instanceof Blob || value instanceof File || value instanceof ArrayBuffer) {
            return true;
        }
        if (ArrayBuffer.isView(value)) {
            return !(value.buffer instanceof SharedArrayBuffer);
        }
        return false;
    }

    private createPlaceholder(fileId: string, path: string[] = []): FilePlaceholder {
        return {
            [PLACEHOLDER_SYMBOL]: true,
            __fileId: fileId,
            __path: path,
        };
    }

    private isPlaceholder(value: any): value is FilePlaceholder {
        return value && value[PLACEHOLDER_SYMBOL] === true;
    }

    private extractBinaries(
        obj: any,
        currentPath: string[] = [],
        files: Array<{ id: string; data: BinaryData; metadata: Record<string, any> }> = [],
    ): any {
        if (obj === null || typeof obj !== "object") return obj;
        if (this.isBinary(obj)) {
            const id = uuidv4();
            files.push({ id, data: obj, metadata: {} });
            this.fileMap.set(id, files[files.length - 1]);
            return this.createPlaceholder(id, currentPath);
        }

        if (Array.isArray(obj)) {
            return obj.map((item, i) =>
                this.isBinary(item) || (typeof item === "object" && item !== null)
                    ? this.extractBinaries(item, [...currentPath, `[${i}]`], files)
                    : item,
            );
        }

        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                continue; // Prevent prototype pollution
            }

            if (this.isBinary(value)) {
                const id = uuidv4();
                const metadata: Record<string, any> = { ...obj };
                delete metadata[key]; // Remove binary field from metadata
                Object.keys(metadata).forEach((k) => {
                    if (k === "__proto__" || k === "constructor" || k === "prototype")
                        delete metadata[k];
                });

                files.push({ id, data: value, metadata });
                this.fileMap.set(id, files[files.length - 1]);
                result[key] = this.createPlaceholder(id, [...currentPath, key]);
            } else if (typeof value === "object" && value !== null) {
                result[key] = this.extractBinaries(value, [...currentPath, key], files);
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
        let fileIndex = 0;

        // Append all files with predictable keys
        this.fileMap.forEach((file, fileId) => {
            const fileKey = `${key}__file__${fileIndex}`;
            const metaKey = `${fileKey}__meta`;

            // Append metadata (non-binary parts)
            super.append(metaKey, JSON.stringify(file.metadata || {}));

            // Append actual binary
            let blob: Blob;
            if (file.data instanceof Blob) {
                blob = file.data;
            } else if (file.data instanceof ArrayBuffer) {
                blob = new Blob([file.data]);
            } else if (
                ArrayBuffer.isView(file.data) &&
                !(file.data.buffer instanceof SharedArrayBuffer)
            ) {
                blob = new Blob([file.data.buffer]);
            } else {
                blob = new Blob([file.data as any]);
            }
            super.append(
                fileKey,
                blob,
                filename || (file.data instanceof File ? file.data.name : "file"),
            );

            fileIndex++;
        });

        // Append cleaned JSON with placeholders
        super.append(`${key}__json`, JSON.stringify(cleanedJson));
    }

    getFiles() {
        return Array.from(this.fileMap.values());
    }
}
