import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { liveQuery } from "dexie";
import { TagRepository } from "@/db/repositories/tagRepository";
import { useTagStore } from "./tag";
import {
    mockCategory,
    mockEnglishCategoryContent,
    mockLanguageEng,
    mockLanguageSwa,
} from "@/tests/mockData";
import { TagType } from "@/types";
import { ContentRepository } from "@/db/repositories/contentRepository";

vi.mock("@/db/repositories/TagRepository");

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

vi.mock("@/util/slug", () => ({
    Slug: {
        generate: () => "fake-slug",
    },
}));

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

    it("can create a post", () => {
        const createSpy = vi.spyOn(TagRepository.prototype, "create");
        const tag = {
            image: "image",
            language: mockLanguageEng,
            title: "title",
            tagType: TagType.Topic,
        };

        const store = useTagStore();
        store.createTag(tag);

        expect(createSpy).toHaveBeenCalledWith(tag);
    });

    it("can update a tag", () => {
        const updateSpy = vi.spyOn(TagRepository.prototype, "update");

        const store = useTagStore();
        store.updateTag(mockEnglishCategoryContent, mockCategory);

        expect(updateSpy).toHaveBeenCalledWith(mockEnglishCategoryContent, mockCategory);
    });

    it("can create a translation", () => {
        const createSpy = vi.spyOn(ContentRepository.prototype, "create");

        const store = useTagStore();
        store.createTranslation(mockCategory, mockLanguageSwa);

        expect(createSpy).toHaveBeenCalledWith({
            parentId: mockCategory._id,
            language: mockLanguageSwa._id,
            title: mockLanguageSwa.name,
        });
    });
});
