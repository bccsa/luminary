import { computed } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { firstParagraphExcerpt } from "@/composables/useSocialShare";

/**
 * The instance-wide copyright notice (`VITE_COPYRIGHT_ID`) — as HTML for the page banner and
 * as plain text for share messages, where it stands in for posts that carry no copyright of
 * their own.
 */
export function useGlobalCopyright() {
    // When VITE_COPYRIGHT_ID is unset there is no copyright page to seek. A
    // `{ parentId: undefined }` clause serializes to `{}` over the wire, leaving the
    // parentId index pinned with a publishDate sort but no parentId equality — which
    // CouchDB rejects ("No index exists for this sort"). Match nothing via a
    // provably-empty `$in` so HybridQuery short-circuits before any Dexie read or POST.
    const copyrightId = import.meta.env.VITE_COPYRIGHT_ID;
    const copyright = useContentQuery(
        () => (copyrightId ? [{ parentId: copyrightId }] : [{ parentId: { $in: [] } }]),
        {
            includeScheduled: false,
            limit: 1,
            // Seek by parentId; the publishDate sort is required to engage the index.
            useIndex: "content-parentId-publishDate-index",
            sort: [{ publishDate: "desc" }],
            // Keep `text` — the copyright body is rendered below; the default strips it.
            stripFields: ["fts", "ftsTokenCount", "memberOf", "_rev"],
            // Same selector on every page for the whole build — fetch it once, not per route.
            buildOnce: true,
        },
    );

    const copyrightHtml = computed(() => copyright.value[0]?.text ?? "");

    // A share message wants one attribution line, so take the notice's opening paragraph
    // and let the same excerpt cap keep a long policy page out of the message.
    const copyrightText = computed(() => firstParagraphExcerpt(copyrightHtml.value));

    return { copyrightHtml, copyrightText };
}
