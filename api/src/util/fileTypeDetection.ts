/**
 * Helper to detect file type from buffer
 * Wrapped to make testing easier
 */
export async function detectFileType(buffer: Uint8Array) {
    // Dynamic import (ESM module inside CJS project)
    const fileTypeModule = await import("file-type");
    const { fileTypeFromBuffer } = fileTypeModule;
    return fileTypeFromBuffer(buffer);
}
