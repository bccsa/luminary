import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { usePostStore } from "./post";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { PostRepository } from "@/db/repositories/postRepository";
import { mockContent, mockLanguageEng, mockPost } from "@/tests/mockData";

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
        const getAllSpy = vi.spyOn(PostRepository.prototype, "getAll");

        usePostStore();

        expect(liveQuery).toHaveBeenCalledOnce();
        expect(getAllSpy).toHaveBeenCalledOnce();
    });

    it("can create a post", () => {
        const createSpy = vi.spyOn(PostRepository.prototype, "create");
        const post = {
            image: "image",
            language: mockLanguageEng,
            title: "title",
        };

        const store = usePostStore();
        store.createPost(post);

        expect(createSpy).toHaveBeenCalledWith(post);
    });

    it("can create a post", () => {
        const createSpy = vi.spyOn(PostRepository.prototype, "update");

        const store = usePostStore();
        store.updatePost(mockContent, mockPost);

        expect(createSpy).toHaveBeenCalledWith(mockContent, mockPost);
    });
});
