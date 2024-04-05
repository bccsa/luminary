import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { BaseRepository } from "./baseRepository";
import { DocType } from "@/types";
import { db } from "../baseDatabase";
import { mockEnglishContentDto, mockFrenchContentDto, mockPostDto } from "@/tests/mockData";

describe("baseRepository", () => {
    afterEach(() => {
        db.docs.clear();
    });

    it("can find an item based on type", async () => {
        db.docs.bulkPut([mockPostDto]);
        const repository = new BaseRepository();

        const result = await repository.whereType(DocType.Post).toArray();

        expect(result[0]._id).toBe(mockPostDto._id);
        expect(result[0].type).toBe(DocType.Post);
    });

    it("can find an item based on id", async () => {
        db.docs.bulkPut([mockPostDto]);
        const repository = new BaseRepository();

        const result = await repository.whereId(mockPostDto._id).first();

        expect(result!._id).toBe(mockPostDto._id);
    });

    it("can find an item based on several id's", async () => {
        db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        const repository = new BaseRepository();

        const result = await repository
            .whereIds([mockEnglishContentDto._id, mockFrenchContentDto._id])
            .toArray();

        expect(result.length).toBe(2);
        expect(result[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[1]._id).toBe(mockFrenchContentDto._id);
    });

    it("can find an item based on parent id", async () => {
        const changeDoc = {
            _id: "change1",
            type: "change",
            parentId: mockEnglishContentDto.parentId,
        } as any;
        db.docs.bulkPut([mockEnglishContentDto, changeDoc]);
        const repository = new BaseRepository();

        const result = await repository
            .whereParentId(mockEnglishContentDto.parentId, DocType.Content)
            .toArray();

        expect(result.length).toBe(1);
        expect(result[0]._id).toBe(mockEnglishContentDto._id); // Change should be excluded
    });
});
