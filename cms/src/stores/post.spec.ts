import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { usePostStore } from "./post";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { mockPostDto } from "@/tests/mockData";

const postsDb = vi.hoisted(() => {
    return {
        bulkPut: vi.fn(),
        toArray: vi.fn(),
    };
});

vi.mock("@/db", () => {
    return {
        db: {
            posts: postsDb,
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

    it("can save posts to the database", () => {
        const store = usePostStore();

        store.savePosts([mockPostDto]);

        expect(postsDb.bulkPut).toHaveBeenCalledWith([mockPostDto]);
    });

    it("runs a live query to get all posts", () => {
        usePostStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(postsDb.toArray).toHaveBeenCalledOnce();
    });
});
