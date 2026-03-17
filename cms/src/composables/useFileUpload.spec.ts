import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFileUpload } from "./useFileUpload";

const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    visible: { value: false },
    message: { value: "" },
    type: { value: "info" as const },
};

vi.mock("@/composables/useToast", () => ({
    useToast: () => mockToast,
}));

vi.mock("mammoth", () => ({
    default: {
        convertToHtml: vi.fn(() => Promise.resolve({ value: "<p>docx content</p>" })),
    },
}));

vi.mock("jszip", () => {
    const mockFile = vi.fn(() => ({
        async: vi.fn(() => Promise.resolve("<text:p>odt content</text:p>")),
    }));
    return {
        default: {
            loadAsync: vi.fn(() => Promise.resolve({ file: mockFile })),
        },
    };
});

describe("useFileUpload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("formatFileSize returns MB string", () => {
        const { formatFileSize } = useFileUpload();
        expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
        expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.50 MB");
    });

    it("clearFiles resets all file and text state", () => {
        const { sourceFile, targetFile, fullSrcText, fullDstText, clearFiles } = useFileUpload();
        sourceFile.value = { name: "a.docx", size: "1.00 MB" };
        targetFile.value = { name: "b.docx", size: "1.00 MB" };
        fullSrcText.value = "src";
        fullDstText.value = "dst";
        clearFiles();
        expect(sourceFile.value).toBeNull();
        expect(targetFile.value).toBeUndefined();
        expect(fullSrcText.value).toBe("");
        expect(fullDstText.value).toBe("");
    });

    it("handleSourceSelected sets sourceFile and fullSrcText for txt file", async () => {
        const { handleSourceSelected, sourceFile, fullSrcText, isProcessing } = useFileUpload();
        const file = new File(["hello world"], "test.txt", { type: "text/plain" });
        const result = await handleSourceSelected(file);
        expect(result).toBe(true);
        expect(sourceFile.value).toEqual({ name: "test.txt", size: expect.any(String) });
        expect(fullSrcText.value).toBe("<p>hello world</p>");
        expect(isProcessing.value).toBe(false);
    });

    it("handleTargetSelected sets targetFile and fullDstText for txt file", async () => {
        const { handleTargetSelected, targetFile, fullDstText } = useFileUpload();
        const file = new File(["target content"], "target.txt", { type: "text/plain" });
        const result = await handleTargetSelected(file);
        expect(result).toBe(true);
        expect(targetFile.value).toEqual({ name: "target.txt", size: expect.any(String) });
        expect(fullDstText.value).toBe("<p>target content</p>");
    });

    it("handleSourceSelected for docx uses mammoth and returns html content", async () => {
        const { handleSourceSelected, fullSrcText } = useFileUpload();
        const file = new File([new ArrayBuffer(8)], "doc.docx", {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const result = await handleSourceSelected(file);
        expect(result).toBe(true);
        expect(fullSrcText.value).toBe("<p>docx content</p>");
    });

    it("handleSourceSelected for odt uses JSZip and converts to html paragraphs", async () => {
        const { handleSourceSelected, fullSrcText } = useFileUpload();
        const file = new File([new ArrayBuffer(8)], "doc.odt", {
            type: "application/vnd.oasis.opendocument.text",
        });
        const result = await handleSourceSelected(file);
        expect(result).toBe(true);
        expect(fullSrcText.value).toBe("<p>odt content</p>");
    });

    it("handleSourceSelected for odf uses JSZip and converts to html paragraphs", async () => {
        const { handleSourceSelected, fullSrcText } = useFileUpload();
        const file = new File([new ArrayBuffer(8)], "doc.odf", {
            type: "application/vnd.oasis.opendocument.formula",
        });
        const result = await handleSourceSelected(file);
        expect(result).toBe(true);
        expect(fullSrcText.value).toBe("<p>odt content</p>");
    });
});
