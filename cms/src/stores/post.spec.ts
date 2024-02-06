import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { usePostStore } from "./post";
import { setActivePinia, createPinia } from "pinia";
import { DocType, type PostDto } from "@/types";
import { liveQuery } from "dexie";

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
        const post: PostDto = {
            _id: "post-post1",
            type: DocType.Post,
            updatedTimeUtc: 3,
            memberOf: ["group-public-content"],
            content: ["content-post1-eng"],
            image: "",
            tags: ["tag-category1", "tag-topicA"],
        };

        store.savePosts([post]);

        expect(postsDb.bulkPut).toHaveBeenCalledWith([post]);
    });

    it("runs a live query to get all posts", () => {
        usePostStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(postsDb.toArray).toHaveBeenCalledOnce();
    });
});
