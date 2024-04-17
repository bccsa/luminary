import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { useGroupStore } from "./group";
import { DocType } from "@/types";

const docsDb = vi.hoisted(() => {
    return {
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        toArray: vi.fn(),
    };
});

vi.mock("@/db/baseDatabase", () => {
    return {
        db: {
            docs: docsDb,
        },
    };
});

vi.mock("dexie", () => {
    return {
        liveQuery: vi.fn().mockImplementation((callback) => {
            callback();
        }),
    };
});

vi.mock("@vueuse/rxjs");

describe("group store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("runs a live query to get all groups", () => {
        useGroupStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(docsDb.equals).toHaveBeenCalledWith(DocType.Group);
    });
});
