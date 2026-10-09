import "fake-indexeddb/auto";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import { db, DocType, type ContentDto } from "luminary-shared";

import {
    setMediaProgress,
    setReadingProgress,
    syncContentProgressFromStorage,
} from "@/contentProgress";
import { userActivityDb } from "../db";
import { MIRROR_INTERVAL_MS, startContentProgressMirror } from "../fromContentProgress";
import { getUserActivity, recordUserActivity, removeUserActivity } from "../store";

const contentDoc = (_id: string, parentId: string) =>
    ({
        _id,
        type: DocType.Content,
        parentId,
        updatedTimeUtc: 1,
        memberOf: [],
    }) as unknown as ContentDto;

/** Let the mirror's queued run drain when there is no new row to wait for. */
const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Seed the continue store as it would be found on disk at startup. */
const storedProgress = (entries: { contentId: string; updatedAt: number }[]) => {
    localStorage.setItem("contentProgress", JSON.stringify(entries));
    syncContentProgressFromStorage();
};

describe("mirroring content progress into history", () => {
    let stop: (() => void) | undefined;

    beforeEach(async () => {
        await userActivityDb.userActivity.clear();
        await db.docs.clear();
        await db.docs.bulkPut([
            contentDoc("content-eng", "post-1"),
            contentDoc("content-fra", "post-1"),
            contentDoc("content-2", "post-2"),
        ]);
        storedProgress([]);
    });

    afterEach(() => {
        stop?.();
        stop = undefined;
        vi.restoreAllMocks();
        localStorage.removeItem("contentProgress");
    });

    const viewedPosts = async () => (await getUserActivity("viewed")).map((row) => row.parentId);

    it("records a view when reading progress is written", async () => {
        stop = startContentProgressMirror();

        setReadingProgress("content-eng", 20);

        await waitForExpect(async () => {
            expect(await viewedPosts()).toEqual(["post-1"]);
        });
    });

    it("records a view when media progress is written", async () => {
        stop = startContentProgressMirror();

        setMediaProgress("media-1", "content-2", 30, 300);

        await waitForExpect(async () => {
            expect(await viewedPosts()).toEqual(["post-2"]);
        });
    });

    it("keeps the view once reading completes and the entry leaves the continue store", async () => {
        stop = startContentProgressMirror();

        setReadingProgress("content-eng", 50);
        await waitForExpect(async () => {
            expect(await viewedPosts()).toEqual(["post-1"]);
        });

        // Reaching 100% drops the entry from the continue store.
        storedProgress([]);

        await waitForExpect(async () => {
            expect(await viewedPosts()).toEqual(["post-1"]);
        });
    });

    it("writes progress found on disk with its own timestamp, not the current one", async () => {
        storedProgress([{ contentId: "content-eng", updatedAt: 1000 }]);

        stop = startContentProgressMirror();

        await waitForExpect(async () => {
            const rows = await getUserActivity("viewed");
            expect(rows).toHaveLength(1);
            expect(rows[0].updatedTimeUtc).toBe(1000);
        });
    });

    it("leaves a deleted entry deleted when the same progress is found again", async () => {
        storedProgress([{ contentId: "content-eng", updatedAt: 1000 }]);
        await recordUserActivity({ type: "viewed", parentId: "post-1" });
        await removeUserActivity({ type: "viewed", parentId: "post-1" });

        stop = startContentProgressMirror();

        await flush();

        expect(await userActivityDb.userActivity.get("viewed:post-1")).toMatchObject({
            deleted: true,
        });
        expect(await viewedPosts()).toEqual([]);
    });

    it("writes at most once a minute per post while reading continues", async () => {
        const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
        stop = startContentProgressMirror();

        setReadingProgress("content-eng", 10);
        await waitForExpect(async () => {
            expect((await getUserActivity("viewed"))[0]?.updatedTimeUtc).toBe(10_000);
        });

        now.mockReturnValue(20_000);
        setReadingProgress("content-eng", 20);
        await flush();
        expect((await getUserActivity("viewed"))[0].updatedTimeUtc).toBe(10_000);

        now.mockReturnValue(10_000 + MIRROR_INTERVAL_MS + 1);
        setReadingProgress("content-eng", 30);
        await waitForExpect(async () => {
            expect((await getUserActivity("viewed"))[0].updatedTimeUtc).toBe(
                10_000 + MIRROR_INTERVAL_MS + 1,
            );
        });
    });

    it("skips content whose document has not synced, and picks it up later", async () => {
        await db.docs.clear();
        stop = startContentProgressMirror();

        setReadingProgress("content-eng", 10);
        await flush();
        expect(await viewedPosts()).toEqual([]);

        await db.docs.put(contentDoc("content-eng", "post-1"));
        setReadingProgress("content-eng", 20);

        await waitForExpect(async () => {
            expect(await viewedPosts()).toEqual(["post-1"]);
        });
    });

    it("stops recording once stopped", async () => {
        stop = startContentProgressMirror();
        stop();
        stop = undefined;

        setReadingProgress("content-eng", 10);
        await flush();

        expect(await viewedPosts()).toEqual([]);
    });
});
