import type { ContentDto } from "luminary-shared";
import { appSyncedLanguageIdsAsRef } from "@/globalConfig";

/**
 * True when a content document is being shown in a language the user has **not synced** (downloaded)
 * — i.e. it is a fetched *fallback*: none of the user's downloaded languages had a translation, so
 * the language-priority selector fell through to the CMS default or another available language.
 *
 * Keys off the **synced** set (`appSyncedLanguageIdsAsRef`), NOT the preferred/display list: a
 * synced language is one the user actively downloaded ("theirs"), so content in it is never flagged;
 * a non-synced language is always a fetched fallback. (Keying off the preferred list would miss the
 * common case where the CMS default sits in the preferred order — e.g. left over from before it
 * stopped being force-synced — but isn't downloaded.) Used to surface a small "shown in <language>"
 * affordance so non-downloaded-language content doesn't read as a bug.
 */
export function isFallbackLanguageContent(content?: Pick<ContentDto, "language"> | null): boolean {
    return !!content?.language && !appSyncedLanguageIdsAsRef.value.includes(content.language);
}
