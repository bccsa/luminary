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
            // Only advance when a published doc's publishDate is newer than the
            // frozen bound (the newly-published case). Edits to already-published
            // docs (publishDate < bound) don't need a re-key. Bump to the real
            // clock — never to a future publishDate — so genuinely scheduled
            // content stays hidden.
            if (content.publishDate !== undefined && content.publishDate > sessionNow()) {
                bumpSessionNow(now);
                return;
            }
        }
    });
}