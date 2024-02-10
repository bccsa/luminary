import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { usePostStore } from "./post";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { PostRepository } from "@/db/repositories/postRepository";

vi.mock("@/db/repositories/postRepository");

vi.mock("@/db/baseDatabase", () => ({}));

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
        const findAllSpy = vi.spyOn(PostRepository.prototype, "findAll");

        usePostStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(findAllSpy).toHaveBeenCalledOnce();
    });
});
