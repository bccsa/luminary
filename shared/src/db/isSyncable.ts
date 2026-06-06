import { config } from "../config";
import { DocType, type BaseDocumentDto } from "../types";

/**
 * The single, authoritative "may this document be persisted to IndexedDB?" gate,
 * derived from the client's configured `syncList`. Used by the Socket.io `data`
 * handler and by HybridQuery's offline-persistence path so neither can drift from
 * the other.
 *
 * A doc is syncable iff it is a `DeleteCmd` (always applied), or a `config.syncList`
 * entry with `sync` truthy matches it — by `type` (for non-`contentOnly` entries),
 * or, for Content, by `parentType` with the active-language filter. An entry with
 * `sync: false` (e.g. the CMS's `user` entry) gates its type OUT, so PII the client
 * subscribes to for live display is never written to local storage.
 */
export function isSyncableDoc(doc: BaseDocumentDto): boolean {
    if (doc.type === DocType.DeleteCmd) return true;

    return (
        config.syncList?.some((entry) => {
            if (!entry.sync) return false; // Do not save documents to indexedDB that should not be synced
            if (!entry.contentOnly && entry.type === doc.type) return true;
            if (doc.type === DocType.Content && doc.parentType === entry.type) {
                // Include content for all languages if no language filter is set,
                // otherwise only content in an active language.
                const langs = config.appLanguageIdsAsRef?.value;
                if (!langs || !langs.length) return true;
                if (doc.language && langs.includes(doc.language)) return true;
            }
            return false;
        }) ?? false
    );
}
