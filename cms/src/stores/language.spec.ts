import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { useLanguageStore } from "./language";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { LanguageRepository } from "@/db/repositories/languageRepository";

vi.mock("@/db/repositories/languageRepository");

vi.mock("@/db/baseDatabase", () => ({}));

vi.mock("dexie", () => {
    return {
        liveQuery: vi.fn().mockImplementation((callback) => {
            callback();
        }),
    };
});

vi.mock("@vueuse/rxjs");

describe("language store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("runs a live query to get all languages", () => {
        const getAllSpy = vi.spyOn(LanguageRepository.prototype, "getAll");

        useLanguageStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(getAllSpy).toHaveBeenCalledOnce();
    });
});
