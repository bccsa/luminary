import type { ContentDto } from "luminary-shared";

/**
 * Phase 2 dependency-key vocabulary — the SINGLE SOURCE OF TRUTH for what a
 * "dependency key" means. Imported by BOTH:
 *  - the build (capture: what each prerendered page read), and
 *  - the deploy-repo regeneration watcher (what a change event touched).
 *
 * Keep this module PURE: no Vue, Dexie, DOM, or import.meta usage, so it is
 * safe to import from Node (vite config / watcher) and the browser bundle alike.
 *
 * Keys are deliberately COARSE (membership/identity, not per-field) and, except
 * for the language-independent `doc:` identity, LANGUAGE-SCOPED so a change in
 * one language never invalidates another language's pages (spec §3.1).
 */

export type DependencyKey = string;

/**
 * Identity of a content item. Keyed by `parentId` (the Post/Tag), which all
 * language translations of the same item SHARE — so a change to any translation
 * invalidates the whole translation group (covers hreflang reciprocity too).
 */
export const docKey = (parentId: string): DependencyKey => `doc:${parentId}`;

/** A content item belongs to a tag/category grouping, in one language. */
export const tagKey = (parentTagId: string, lang: string): DependencyKey =>
    `tag:${parentTagId}:${lang}`;

/** The home "pinned" feed, in one language. */
export const pinnedFeedKey = (lang: string): DependencyKey => `feed:pinned:${lang}`;

/** The home "newest" feed, in one language. */
export const newestFeedKey = (lang: string): DependencyKey => `feed:newest:${lang}`;

type DocLike = Pick<
    ContentDto,
    "_id" | "parentId" | "parentTags" | "parentPinned" | "language"
>;

/**
 * The keys a single content doc participates in. Used by build fetchers (to
 * report what a render read) AND by the watcher (to compute what a change
 * touched). Deterministic and pure.
 */
export function keysForChangedDoc(doc: DocLike): DependencyKey[] {
    const lang = doc.language ?? "";
    const keys = new Set<DependencyKey>();
    keys.add(docKey(doc.parentId || doc._id));
    for (const t of doc.parentTags ?? []) keys.add(tagKey(t, lang));
    if (doc.parentPinned && doc.parentPinned > 0) keys.add(pinnedFeedKey(lang));
    // Any published, list-eligible item is a candidate for the newest feed.
    keys.add(newestFeedKey(lang));
    return [...keys];
}

/**
 * On a re-categorization (tags changed) the OLD and NEW groupings both go stale,
 * so union the keys of the previous and next doc state (spec §3.3, §7). Only the
 * watcher can call this — it is the only side that has the previous doc state.
 */
export function keysForRecategorization(prev: DocLike, next: DocLike): DependencyKey[] {
    return [...new Set([...keysForChangedDoc(prev), ...keysForChangedDoc(next)])];
}
