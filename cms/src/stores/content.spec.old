import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { useContentStore } from "./content";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { ContentRepository } from "@/db/repositories/contentRepository";

vi.mock("@/db/repositories/contentRepository");

const docsDb = vi.hoisted(() => {
    return {
        put: vi.fn(),
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
    };
});

vi.mock("@/db/baseDatabase", () => {
    return {
        db: {
            docs: docsDb,
            localChanges: docsDb,
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

describe("content store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("runs a live query to get all content", () => {
        const getAllSpy = vi.spyOn(ContentRepository.prototype, "getAll");

        useContentStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(getAllSpy).toHaveBeenCalledOnce();
    });
});
