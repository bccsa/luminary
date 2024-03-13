import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { TagRepository } from "@/db/repositories/tagRepository";
import { useTagStore } from "./tag";
import { mockCategory, mockEnglishCategoryContent } from "@/tests/mockData";

vi.mock("@/db/repositories/postRepository");

const docsDb = vi.hoisted(() => {
    return {
        put: vi.fn(),
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockReturnThis(),
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

    it("runs a live query to get all tags", () => {
        const getAllSpy = vi.spyOn(TagRepository.prototype, "getAll");

        useTagStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(getAllSpy).toHaveBeenCalledOnce();
    });

    it("can update a tag", () => {
        const updateSpy = vi.spyOn(TagRepository.prototype, "update");

        const store = useTagStore();
        store.updateTag(mockEnglishCategoryContent, mockCategory);

        expect(updateSpy).toHaveBeenCalledWith(mockEnglishCategoryContent, mockCategory);
    });
});
