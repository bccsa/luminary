import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { DocType, type ContentDto } from "@/types";
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
        const content: ContentDto = {
            _id: "content-post1-eng",
            type: DocType.Content,
            updatedTimeUtc: 3,
            memberOf: ["group-public-content"],
            language: "lang-eng",
            status: "published",
            slug: "post1-eng",
            title: "Post 1",
            summary: "This is an example post",
            author: "ChatGPT",
            text: "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.",
            localisedImage: "",
            audio: "",
            video: "",
            publishDate: 3,
            expiryDate: 0,
        };

        store.saveContent([content]);

        expect(contentDb.bulkPut).toHaveBeenCalledWith([content]);
    });
});
