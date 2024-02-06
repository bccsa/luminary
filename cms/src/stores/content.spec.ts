import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mockContentDto } from "@/tests/mockData";
import { useContentStore } from "./content";

const contentDb = vi.hoisted(() => {
    return {
        bulkPut: vi.fn(),
        toArray: vi.fn(),
    };
});

vi.mock("@/db", () => {
    return {
        db: {
            content: contentDb,
        },
    };
});

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

    it("can save content to the database", () => {
        const store = useContentStore();

        store.saveContent([mockContentDto]);

        expect(contentDb.bulkPut).toHaveBeenCalledWith([mockContentDto]);
    });
});
