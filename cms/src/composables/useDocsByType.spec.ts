import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { watch } from "vue";
import {
    db,
    DocType,
    initConfig,
    initDatabase,
    useHybridQueryWithState,
    type LanguageDto,
} from "luminary-shared";
import { CMS_DOCS_INDEX } from "@/docsIndex";
import { useDocsByType, resetDocsByTypeCache } from "./useDocsByType";
import waitForExpect from "wait-for-expect";

const mockLang = (id: string): LanguageDto => ({
    _id: id,
    type: DocType.Language,
    updatedTimeUtc: 1,
    memberOf: ["group-languages"],
    languageCode: id,
    name: id,
    default: 0,
    translations: {},
});

describe("useDocsByType", () => {
    beforeAll(async () => {
        initConfig({ cms: true, docsIndex: CMS_DOCS_INDEX, apiUrl: "http://localhost:12399" });
        await initDatabase();
    });

    beforeEach(async () => {
        // Bind a fresh shared query to THIS spec's database. The cache is a process-lifetime
        // singleton, so without this a Language query created (and cached) by an earlier spec file
        // would still be subscribed to that file's now-stale connection and never see our writes.
        resetDocsByTypeCache();
        await db.docs.clear();
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("emits data that is written AFTER the query was created (stays live)", async () => {
        // Mirrors runtime: the shared query is created while Dexie is empty, then sync writes docs.
        const languages = useDocsByType<LanguageDto>(DocType.Language);
        expect(languages.value).toHaveLength(0);

        await db.docs.bulkPut([mockLang("eng"), mockLang("fra")]);

        // Generous timeout: the Dexie liveQuery callback can be starved well past the 4.5s default
        // when the full suite saturates the CPU across parallel workers.
        await waitForExpect(() => {
            expect(languages.value.map((l) => l._id).sort()).toEqual(["eng", "fra"]);
        }, 15000);
    });

    it("returns the same shared ref for repeated calls of the same type", () => {
        const a = useDocsByType<LanguageDto>(DocType.Language);
        const b = useDocsByType<LanguageDto>(DocType.Language);
        expect(a).toBe(b);
    });

    it("a fires-once watcher resolves even when the type has NO docs (empty result still emits)", async () => {
        await db.docs.clear(); // nothing of this type exists
        const src = useDocsByType<LanguageDto>(DocType.Storage); // guaranteed empty
        let settled = false;
        const stop = watch(
            src,
            () => {
                settled = true;
                stop();
            },
            { flush: "post" },
        );
        // If the empty result never emits, `settled` stays false and a real isLoading would hang.
        await waitForExpect(() => {
            expect(settled).toBe(true);
        });
    });

    it("useHybridQueryWithState.isFetching resolves to false for an empty result", async () => {
        await db.docs.clear(); // no Storage docs → genuinely empty
        const { isFetching } = useHybridQueryWithState(() => ({ selector: { type: DocType.Storage } }), {
            live: true,
        });
        // isFetching is the correct "fetching vs fetched-empty" signal — must settle to false even
        // though the result stays empty (the fires-once watch-on-output pattern does NOT).
        await waitForExpect(() => {
            expect(isFetching.value).toBe(false);
        });
    });
});
