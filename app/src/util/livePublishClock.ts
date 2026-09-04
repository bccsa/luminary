import {
    DocType,
    PublishStatus,
    getSocket,
    type ApiDataResponseDto,
    type ContentDto,
} from "luminary-shared";
import { bumpSessionNow, sessionNow } from "./sessionNow";

/**
 * Advance the session "now" bound when live-sync delivers newly published content.
 *
 * `mangoIsPublished` bakes `publishDate <= sessionNow()` into every content feed's
 * selector, and `sessionNow()` is captured at page load. A post published after
 * the page loaded has `publishDate` newer than that bound, so the live Dexie
 * re-query filters it out — it only appears after a refresh. Listening to the
 * socket `"data"` feed (the same feed shared's `liveSync` persists) lets us bump
 * the bound to the real clock the moment such a doc arrives, which re-keys the
 * content queries and lets the new doc through — without a refresh and without
 * any idle ticking (the bound only moves when new content actually arrives).
 *
 * Registered once at startup from `main.ts`. The socket re-fires its listeners
 * across reconnects, so a single registration is sufficient.
 */
export function initLivePublishClock(): void {
    getSocket().on("data", (data: ApiDataResponseDto) => {
        const now = Date.now();
        for (const doc of data.docs) {
            if (doc.type !== DocType.Content) continue;
            const content = doc as ContentDto;
            if (content.status !== PublishStatus.Published) continue;
            // Only advance for the newly-published case: publishDate newer than
            // the bound but not in the future. Edits to already-published docs
            // (publishDate <= bound) need no re-key. Future-scheduled docs are
            // excluded too — a bump wouldn't let a future publishDate through, and
            // includeScheduled feeds already show coming-soon via
            // parentShowComingSoon (bound-independent), so it'd be a no-op cascade.
            if (
                content.publishDate !== undefined &&
                content.publishDate > sessionNow() &&
                content.publishDate <= now
            ) {
                bumpSessionNow(now);
                return;
            }
        }
    });
}