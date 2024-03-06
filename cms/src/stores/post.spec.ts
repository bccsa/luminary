import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { usePostStore } from "./post";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { PostRepository } from "@/db/repositories/postRepository";
import { mockEnglishContent, mockLanguageEng, mockLanguageSwa, mockPost } from "@/tests/mockData";
import { ContentRepository } from "@/db/repositories/contentRepository";

vi.mock("@/db/repositories/postRepository");

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
        store.updatePost(mockEnglishContent, mockPost);

        expect(createSpy).toHaveBeenCalledWith(mockEnglishContent, mockPost);
    });

    it("can create a translation", () => {
        const createSpy = vi.spyOn(ContentRepository.prototype, "create");

        const store = usePostStore();
        store.createTranslation(mockPost, mockLanguageSwa);

        expect(createSpy).toHaveBeenCalledWith({
            parentId: mockPost._id,
            language: mockLanguageSwa._id,
            title: mockLanguageSwa.name,
        });
    });
});
