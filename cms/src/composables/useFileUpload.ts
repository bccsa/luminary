import { ref } from "vue";
import mammoth from "mammoth";
import JSZip from "jszip";

export function useFileUpload() {
    const isProcessing = ref(false);
    const sourceFile = ref<{ name: string; size: string } | null>(null);
    const targetFile = ref<{ name: string; size: string } | undefined>(undefined);
    const fullSrcText = ref("");
    const fullDstText = ref("");

    async function extractTextFromFile(file: File): Promise<string> {
        const escapeHtml = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });

        if (file.name.endsWith(".docx")) {
            const result = await mammoth.convertToHtml({ arrayBuffer });
            return result.value;
        }
        if (file.name.endsWith(".odt") || file.name.endsWith(".odf")) {
            const zip = await JSZip.loadAsync(arrayBuffer);
            const contentXml = await zip.file("content.xml")?.async("string");
            if (!contentXml) return "";
            // Use null-char placeholders so paragraph tags survive the XML strip pass
            const PARA = "\x00P\x00";
            const ENDPARA = "\x00/P\x00";
            return contentXml
                .replace(/<text:line-break[^>]*\/?>/gi, "<br>")
                .replace(/<text:tab[^>]*\/?>/gi, "\t")
                .replace(/<text:p[^>]*>/gi, PARA)
                .replace(/<\/text:p>/gi, ENDPARA)
                .replace(/<text:h[^>]*>/gi, PARA)
                .replace(/<\/text:h>/gi, ENDPARA)
                .replace(/<[^>]+>/g, "")
                .split(ENDPARA)
                .map((para) => para.replace(new RegExp(PARA, "g"), "").trim())
                .filter((para) => para)
                .map((para) => `<p>${escapeHtml(para)}</p>`)
                .join("");
        }
        const text = new TextDecoder().decode(arrayBuffer);
        return text
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join("");
    }

    function formatFileSize(size: number): string {
        return (size / 1024 / 1024).toFixed(2) + " MB";
    }

    const handleSourceSelected = async (file: File) => {
        isProcessing.value = true;
        sourceFile.value = {
            name: file.name,
            size: formatFileSize(file.size),
        };
        try {
            fullSrcText.value = await extractTextFromFile(file);
            return true;
        } catch (error) {
            sourceFile.value = null;
            return false;
        } finally {
            isProcessing.value = false;
        }
    };

    const handleTargetSelected = async (file: File) => {
        isProcessing.value = true;
        targetFile.value = {
            name: file.name,
            size: formatFileSize(file.size),
        };
        try {
            fullDstText.value = await extractTextFromFile(file);
            return true;
        } catch (error) {
            targetFile.value = undefined;
            return false;
        } finally {
            isProcessing.value = false;
        }
    };

    const clearFiles = () => {
        sourceFile.value = null;
        targetFile.value = undefined;
        fullSrcText.value = "";
        fullDstText.value = "";
    };

    return {
        isProcessing,
        sourceFile,
        targetFile,
        fullSrcText,
        fullDstText,
        handleSourceSelected,
        handleTargetSelected,
        clearFiles,
        extractTextFromFile,
        formatFileSize,
    };
}
