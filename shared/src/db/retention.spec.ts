import "fake-indexeddb/auto";
import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from "vitest";

// Stub the debounced corpus-stats recompute so eviction doesn't leak a 10s timer,
// and so we can assert it's scheduled. Everything else in the module stays real.
vi.mock("../fts/ftsIndexer", async (importOriginal) => {
    const orig = await importOriginal<typeof import("../fts/ftsIndexer")>();
    return { ...orig, scheduleCorpusStatsRecompute: vi.fn() };
});

import { db, initDatabase } from "./database";
import {
    touchRetention,
    flushRetention,
    evictStaleBelowCutoff,
    pruneUnsyncedLanguageContent,
    resetRetentionBuffer,
} from "./retention";
import { initConfig, config } from "../config";
import { scheduleCorpusStatsRecompute } from "../fts/ftsIndexer";
import { DocType, type BaseDocumentDto } from "../types";

const CUTOFF = 1000;

const content = (_id: string, publishDate: number): BaseDocumentDto =>
    ({
        _id,
        type: DocType.Content,
        parentType: DocType.Post,
        publishDate,
        updatedTimeUtc: 1,
        memberOf: [],
    }) as unknown as BaseDocumentDto;

describe("retention", () => {
    beforeAll(async () => {
        initConfig({
            cms: false,
            docsIndex: "[type+postType]",
            apiUrl: "http://localhost:12345",
            contentPublishDateCutoff: CUTOFF,
        });
        await initDatabase();
    });

    beforeEach(async () => {
        resetRetentionBuffer();
        await db.docs.clear();
        await db.retention.clear();
        config.cms = false;
        config.contentPublishDateCutoff = CUTOFF;
        config.offlineRetentionTtlMs = undefined; // back to the 30-day default between tests
        vi.mocked(scheduleCorpusStatsRecompute).mockClear();
    });

    afterEach(() => {
        resetRetentionBuffer();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe("touchRetention / flushRetention (deferred + batched)", () => {
        it("writes nothing synchronously; flushRetention writes the batch in one bulkPut", async () => {
            const spy = vi.spyOn(db.retention, "bulkPut");
            touchRetention(["a", "b"]);
            expect(spy).not.toHaveBeenCalled();
            expect(await db.retention.count()).toBe(0);

            await flushRetention();
            expect(spy).toHaveBeenCalledTimes(1);
            expect(await db.retention.count()).toBe(2);
            expect((await db.retention.get("a"))!.retainUntil).toBeGreaterThan(Date.now());
        });

        it("coalesces repeated / overlapping ids into one batch", async () => {
            const spy = vi.spyOn(db.retention, "bulkPut");
            touchRetention(["a", "b"]);
            touchRetention(["b", "c"]); // b already fresh → skipped; c added
            await flushRetention();
            expect(spy).toHaveBeenCalledTimes(1);
            const ids = (await db.retention.toArray()).map((r) => r.docId).sort();
            expect(ids).toEqual(["a", "b", "c"]);
        });

        it("throttle skips a still-fresh doc (no redundant write)", async () => {
            const spy = vi.spyOn(db.retention, "bulkPut");
            touchRetention(["a"]);
            await flushRetention(); // write 1
            touchRetention(["a"]); // fresh → skipped
            await flushRetention(); // pending empty → no write
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it("flushes automatically within the flush interval", async () => {
            vi.useFakeTimers();
            const spy = vi.spyOn(db.retention, "bulkPut");
            touchRetention(["a"]);
            expect(spy).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(10_000);
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it("does nothing for an empty id list (no flush scheduled)", async () => {
            // bulkPut mocked so no fake-indexeddb work is needed under fake timers.
            const spy = vi.spyOn(db.retention, "bulkPut").mockResolvedValue([] as never);
            vi.useFakeTimers();
            touchRetention([]); // early return — no timer armed
            await vi.advanceTimersByTimeAsync(10_000);
            expect(spy).not.toHaveBeenCalled();
        });

        it("a second touch in the same window reuses the single timer (one bulkPut for two touches)", async () => {
            const spy = vi.spyOn(db.retention, "bulkPut").mockResolvedValue([] as never);
            vi.useFakeTimers();
            touchRetention(["a"]); // arms the timer
            touchRetention(["b"]); // flushTimer already set → no second timer
            await vi.advanceTimersByTimeAsync(10_000);
            expect(spy).toHaveBeenCalledTimes(1); // both ids written in ONE flush
            const ids = (spy.mock.calls[0][0] as Array<{ docId: string }>).map((e) => e.docId).sort();
            expect(ids).toEqual(["a", "b"]);
        });

        it("re-stamps a doc once granularity (= ttl/2) elapses, proving min(GRANULARITY_MS, ttl/2)", async () => {
            // Tiny ttl: granularity = floor(ttl/2) = 5ms, far below the 1-day GRANULARITY_MS.
            // If the fixed day were used, the doc would never be re-stamped in this window.
            config.offlineRetentionTtlMs = 10;
            const spy = vi.spyOn(db.retention, "bulkPut");

            touchRetention(["a"]);
            await flushRetention(); // write 1
            expect(spy).toHaveBeenCalledTimes(1);

            await new Promise((r) => setTimeout(r, 8)); // > granularity (5ms) → no longer fresh
            touchRetention(["a"]); // re-stamped because granularity is ttl/2, not the day
            await flushRetention(); // write 2
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it("clears the throttle map past MAX_RECENT, so a previously-fresh id is re-stamped", async () => {
            // bulkPut mocked to avoid writing 5001 rows into fake-indexeddb.
            const spy = vi.spyOn(db.retention, "bulkPut").mockResolvedValue([] as never);

            touchRetention(["sentinel"]);
            await flushRetention(); // sentinel now "fresh" in recentlyStamped

            const many = Array.from({ length: 5001 }, (_v, i) => `bulk-${i}`);
            touchRetention(many); // size > MAX_RECENT → recentlyStamped.clear()
            await flushRetention();

            spy.mockClear();
            touchRetention(["sentinel"]); // no longer "known" after the clear → re-stamped
            await flushRetention();
            expect(spy).toHaveBeenCalledTimes(1);
            const written = spy.mock.calls[0][0] as Array<{ docId: string }>;
            expect(written.map((e) => e.docId)).toEqual(["sentinel"]);
        });

        it("flushRetention clears a pending auto-flush timer (no double write)", async () => {
            const spy = vi.spyOn(db.retention, "bulkPut").mockResolvedValue([] as never);
            vi.useFakeTimers();
            touchRetention(["a"]); // arms the auto-flush timer
            await flushRetention(); // manual flush clears that timer
            expect(spy).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(10_000); // timer was cleared → no second flush
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it("flushRetention with an empty buffer does not write", async () => {
            const spy = vi.spyOn(db.retention, "bulkPut");
            await flushRetention(); // pending empty → early return
            expect(spy).not.toHaveBeenCalled();
        });

        it("flushRetention swallows a bulkPut rejection (logs, does not throw)", async () => {
            const err = new Error("boom");
            const spy = vi.spyOn(db.retention, "bulkPut").mockRejectedValueOnce(err);
            const errLog = vi.spyOn(console, "error").mockImplementation(() => {});
            touchRetention(["a"]);
            await expect(flushRetention()).resolves.toBeUndefined(); // does not reject
            expect(spy).toHaveBeenCalledTimes(1);
            expect(errLog).toHaveBeenCalledWith("[retention] flush failed:", err);
        });
    });

    describe("evictStaleBelowCutoff", () => {
        const seed = (docId: string, retainUntil: number) =>
            db.retention.put({ docId, retainUntil });

        it("deletes below-cutoff Content with stale/absent retention; keeps fresh, above-cutoff, non-Content", async () => {
            const now = Date.now();
            await db.docs.bulkPut([
                content("below-fresh", 500),
                content("below-stale", 400),
                content("below-none", 300),
                content("above", 2000),
                { _id: "below-nonContent", type: DocType.Post, publishDate: 200, updatedTimeUtc: 1 } as unknown as BaseDocumentDto,
            ]);
            await seed("below-fresh", now + 1e9);
            await seed("below-stale", now - 1e9);
            // below-none: no retention row at all → treated as stale

            await evictStaleBelowCutoff();

            const remaining = (await db.docs.toArray()).map((d) => d._id).sort();
            expect(remaining).toEqual(["above", "below-fresh", "below-nonContent"]);
            expect(await db.retention.get("below-stale")).toBeUndefined(); // cleaned
            expect(await db.retention.get("below-fresh")).toBeDefined(); // kept
            expect(scheduleCorpusStatsRecompute).toHaveBeenCalled();
        });

        it("does not evict below-cutoff Content with parentAlwaysOffline even when retention is stale", async () => {
            const now = Date.now();
            await db.docs.bulkPut([
                {
                    ...(content("always-offline", 400) as object),
                    parentAlwaysOffline: true,
                } as BaseDocumentDto,
            ]);
            await seed("always-offline", now - 1e9);

            await evictStaleBelowCutoff();

            expect(await db.docs.get("always-offline")).toBeDefined();
        });

        it("does not evict Tag content below the Post cutoff", async () => {
            await db.docs.bulkPut([
                {
                    ...(content("tag-content", 400) as object),
                    parentType: DocType.Tag,
                } as BaseDocumentDto,
            ]);

            await evictStaleBelowCutoff();

            expect(await db.docs.get("tag-content")).toBeDefined();
        });

        it("leaves a Content doc that has no publishDate (absent from the publishDate index)", async () => {
            // A Content doc with no publishDate isn't in the publishDate index, so the
            // below-cutoff range query never sees it → never evicted (documented: only
            // docs with a real publishDate are retention-managed), even with no stamp.
            await db.docs.bulkPut([
                { _id: "no-pd", type: DocType.Content, updatedTimeUtc: 1 } as unknown as BaseDocumentDto,
            ]);
            await evictStaleBelowCutoff();
            expect(await db.docs.get("no-pd")).toBeDefined();
        });

        it("reaps an expired ORPHAN retention row (no matching doc), keeps a fresh one", async () => {
            // A row whose doc isn't in db.docs — e.g. a viewed online-only article that
            // was stamped but never persisted. The below-cutoff doc pass never sees it
            // (it iterates db.docs), so the expired-retention sweep is what reaps it.
            await db.retention.put({ docId: "orphan-expired", retainUntil: Date.now() - 1e9 });
            await db.retention.put({ docId: "orphan-fresh", retainUntil: Date.now() + 1e9 });
            // db.docs is empty

            await evictStaleBelowCutoff();

            expect(await db.retention.get("orphan-expired")).toBeUndefined(); // swept
            expect(await db.retention.get("orphan-fresh")).toBeDefined(); // not yet expired
        });

        it("flushes pending stamps first, so a just-touched below-cutoff doc survives", async () => {
            await db.docs.bulkPut([content("below-touched", 500)]);
            touchRetention(["below-touched"]); // pending, not yet flushed
            await evictStaleBelowCutoff();
            expect(await db.docs.get("below-touched")).toBeDefined();
        });

        it("is a no-op in CMS mode", async () => {
            config.cms = true;
            await db.docs.bulkPut([content("below-stale", 400)]);
            await evictStaleBelowCutoff();
            expect(await db.docs.get("below-stale")).toBeDefined();
        });

        it("is a no-op when no content cutoff is configured", async () => {
            config.contentPublishDateCutoff = undefined; // → OPEN_MIN
            await db.docs.bulkPut([content("below-stale", 400)]);
            await evictStaleBelowCutoff();
            expect(await db.docs.get("below-stale")).toBeDefined();
        });

        it("returns without deleting or recomputing when nothing is below the cutoff", async () => {
            await db.docs.bulkPut([content("above", 2000)]); // only above-cutoff content
            const deleteSpy = vi.spyOn(db.docs, "bulkDelete");
            await evictStaleBelowCutoff();
            expect(await db.docs.get("above")).toBeDefined();
            expect(deleteSpy).not.toHaveBeenCalled();
            expect(scheduleCorpusStatsRecompute).not.toHaveBeenCalled();
        });

        it("deletes nothing and does not recompute when all below-cutoff docs are fresh", async () => {
            const now = Date.now();
            await db.docs.bulkPut([content("below-fresh1", 500), content("below-fresh2", 400)]);
            await seed("below-fresh1", now + 1e9);
            await seed("below-fresh2", now + 1e9);
            const deleteSpy = vi.spyOn(db.docs, "bulkDelete");

            await evictStaleBelowCutoff();

            expect(await db.docs.get("below-fresh1")).toBeDefined();
            expect(await db.docs.get("below-fresh2")).toBeDefined();
            expect(deleteSpy).not.toHaveBeenCalled(); // stale.length === 0 → early return
            expect(scheduleCorpusStatsRecompute).not.toHaveBeenCalled();
        });
    });

    describe("registerHideFlush (best-effort flush on hide / unload)", () => {
        // The hide listeners call the module-local flushRetention directly, so we assert
        // their effect (pending stamps land in the table) rather than spying the call.
        const settle = () => new Promise((r) => setTimeout(r, 0)); // let void flushRetention() finish

        it("flushes pending stamps on document visibilitychange → hidden", async () => {
            touchRetention(["hide-vis"]); // ensures listeners registered + pending stamp
            expect(await db.retention.get("hide-vis")).toBeUndefined(); // not yet flushed

            Object.defineProperty(document, "visibilityState", {
                value: "hidden",
                configurable: true,
            });
            document.dispatchEvent(new Event("visibilitychange"));
            await settle();

            expect(await db.retention.get("hide-vis")).toBeDefined();
        });

        it("does NOT flush on visibilitychange while still visible", async () => {
            touchRetention(["still-visible"]);
            Object.defineProperty(document, "visibilityState", {
                value: "visible",
                configurable: true,
            });
            document.dispatchEvent(new Event("visibilitychange"));
            await settle();
            expect(await db.retention.get("still-visible")).toBeUndefined(); // still pending
        });

        it("flushes pending stamps on window pagehide", async () => {
            touchRetention(["hide-pagehide"]);
            expect(await db.retention.get("hide-pagehide")).toBeUndefined();

            window.dispatchEvent(new Event("pagehide"));
            await settle();

            expect(await db.retention.get("hide-pagehide")).toBeDefined();
        });

        it("registers the hide listeners only once across many touches", () => {
            // By this point earlier touches have already registered the listeners, so a
            // fresh touch must not add more — hideFlushRegistered guards re-registration.
            const docAdd = vi.spyOn(document, "addEventListener");
            const winAdd = vi.spyOn(window, "addEventListener");
            touchRetention(["once-a"]);
            touchRetention(["once-b"]);
            expect(docAdd).not.toHaveBeenCalledWith("visibilitychange", expect.anything());
            expect(winAdd).not.toHaveBeenCalledWith("pagehide", expect.anything());
        });
    });

    describe("pruneUnsyncedLanguageContent (cleanup of un-ticked languages)", () => {
        const langContent = (_id: string, language: string): BaseDocumentDto =>
            ({
                _id,
                type: DocType.Content,
                language,
                publishDate: CUTOFF + 5000, // above cutoff — eviction-by-cutoff would NOT touch these
                updatedTimeUtc: 1,
                memberOf: [],
            }) as unknown as BaseDocumentDto;

        it("deletes un-stamped Content in the given languages, keeps other languages", async () => {
            await db.docs.bulkPut([
                langContent("fr1", "lang-fr"),
                langContent("fr2", "lang-fr"),
                langContent("en1", "lang-en"),
            ]);

            await pruneUnsyncedLanguageContent(["lang-fr"]);

            expect(await db.docs.get("fr1")).toBeUndefined();
            expect(await db.docs.get("fr2")).toBeUndefined();
            expect(await db.docs.get("en1")).toBeDefined(); // not in the pruned set
            expect(scheduleCorpusStatsRecompute).toHaveBeenCalled();
        });

        it("keeps a recently-served (retention-stamped) doc", async () => {
            await db.docs.bulkPut([langContent("fr-pinned", "lang-fr"), langContent("fr-cold", "lang-fr")]);
            touchRetention(["fr-pinned"]); // active deadline in the future
            await flushRetention();

            await pruneUnsyncedLanguageContent(["lang-fr"]);

            expect(await db.docs.get("fr-pinned")).toBeDefined(); // survived (stamped)
            expect(await db.docs.get("fr-cold")).toBeUndefined(); // pruned (no stamp)
        });

        it("is a no-op for an empty language list and in CMS mode", async () => {
            await db.docs.bulkPut([langContent("fr1", "lang-fr")]);

            await pruneUnsyncedLanguageContent([]);
            expect(await db.docs.get("fr1")).toBeDefined();

            config.cms = true;
            await pruneUnsyncedLanguageContent(["lang-fr"]);
            expect(await db.docs.get("fr1")).toBeDefined();
            config.cms = false;
        });
    });
});
