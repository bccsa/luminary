import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mockContent, mockPostDto } from "@/tests/mockData";
import { fromDto } from "./postMapper";

const chainedWhere = vi.hoisted(() => {
    return {
        anyOf: vi.fn().mockImplementation(() => {
            return {
                toArray: vi.fn().mockImplementation(() => {
                    return [mockContent];
                }),
            };
        }),
    };
});

const docsDb = vi.hoisted(() => {
    return {
        where: vi.fn().mockImplementation(() => chainedWhere),
    };
});

vi.mock("@/db", () => {
    return {
        db: {
            docs: docsDb,
        },
    };
});

describe("postMapper", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("can map one DTO to a domain object", async () => {
        const post = await fromDto(mockPostDto);

        expect(chainedWhere.anyOf).toHaveBeenCalledWith(["content-post1-eng"]);
        expect(post.content[0]._id).toBe("content-post1-eng");
    });
});
