import type {
    SharePayload,
    ShareResult,
    ShareService,
} from "@/build-time/contracts/share/contract";

/**
 * Browser {@link ShareService} backed by the Web Share API, used on phones and tablets only:
 * there the sheet lists the messaging apps the reader actually has, while a desktop sheet
 * mostly re-lists web targets the curated menu already covers.
 */
export class WebShareService implements ShareService {
    // Web Share can be present but blocked (e.g. an iframe without the web-share
    // permission); once it is refused, the curated targets serve the rest of the session.
    private blocked = false;

    isAvailable(): boolean {
        return (
            !this.blocked &&
            typeof navigator.share === "function" &&
            window.matchMedia("(pointer: coarse)").matches
        );
    }

    canShareFiles(files: File[]): boolean {
        return navigator.canShare?.({ files }) ?? false;
    }

    async share(payload: SharePayload): Promise<ShareResult> {
        if (!this.isAvailable()) return "unavailable";
        try {
            await navigator.share(payload);
            return "shared";
        } catch (e) {
            const name = (e as DOMException)?.name;
            // InvalidStateError: a second tap while the sheet is still open.
            if (name === "AbortError" || name === "InvalidStateError") return "dismissed";
            if (name === "NotAllowedError") this.blocked = true;
            return "unavailable";
        }
    }
}
