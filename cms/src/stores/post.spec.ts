import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { usePostStore } from "./post";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { toArray } from "rxjs";

const docsDb = vi.hoisted(() => {
    return {
        toArray: vi.fn(),
    };
});

vi.mock("@/db", () => {
    return {
        db: {
            docs: {
                where: vi.fn().mockImplementation(() => {
                    return {
                        equals: vi.fn().mockImplementation(() => {
                            return docsDb;
                        }),
                    };
                }),
            },
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

describe("post store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("runs a live query to get all posts", () => {
        usePostStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(docsDb.toArray).toHaveBeenCalledOnce();
    });
});
