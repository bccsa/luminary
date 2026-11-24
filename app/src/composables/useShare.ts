import { inject, onMounted, ref } from "vue";
import { ShareKey } from "@/build-time/contracts/share/token";
import { formatShareMessage } from "@/composables/useSocialShare";
import { trackShare } from "@/analytics";

/** One share, whichever way it goes out: the OS share sheet or a curated target. */
export type ShareDraft = {
    /** The quoted passage: a reader's text selection, or an excerpt of the article. */
    quote?: string;
    title: string;
    copyright?: string;
    url: string;
};

/**
 * The one share flow for the article and its text selections: the OS share sheet where the
 * platform has one worth preferring, the curated targets (`ShareTargets`) otherwise.
 */
export function useShare() {
    const service = inject(ShareKey, undefined);

    // Resolved after mount, not at setup: the prerendered HTML has no `navigator`, and
    // rendering the same trigger on both sides keeps hydration matched.
    const nativeShareAvailable = ref(false);
    onMounted(() => {
        nativeShareAvailable.value = service?.isAvailable() ?? false;
    });

    /**
     * Opens the OS share sheet. Resolves false when it couldn't, so the caller shows the
     * curated targets instead. Call it straight from the tap: iOS drops the user activation
     * the sheet needs across an earlier `await`.
     */
    async function shareNatively(draft: ShareDraft, files?: File[]): Promise<boolean> {
        if (!service) return false;
        const result = await service.share({
            title: draft.title,
            text: formatShareMessage({
                quote: draft.quote,
                title: draft.title,
                copyright: draft.copyright,
            }),
            url: draft.url,
            files,
        });
        if (result === "shared") trackShare("share_sheet", draft);
        if (result !== "unavailable") return true;
        nativeShareAvailable.value = false;
        return false;
    }

    return {
        nativeShareAvailable,
        shareNatively,
        canShareFiles: (files: File[]) => service?.canShareFiles(files) ?? false,
    };
}
