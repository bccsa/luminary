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

    it("can find an item based on several parent id's", async () => {
        db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        const repository = new BaseRepository();

        const result = await repository
            .whereParentIds([mockEnglishContentDto.parentId, mockFrenchContentDto.parentId])
            .toArray();

        expect(result.length).toBe(2);
        expect(result[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[1]._id).toBe(mockFrenchContentDto._id);
    });

    it("can find an item based on several language id's", async () => {
        db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        const repository = new BaseRepository();

        const result = await repository
            .whereLanguageIds([mockEnglishContentDto.language, mockFrenchContentDto.language])
            .toArray();

        expect(result.length).toBe(2);
        expect(result[0]._id).toBe(mockEnglishContentDto._id);
        expect(result[1]._id).toBe(mockFrenchContentDto._id);
    });

    it("can find documents that are not members of a list of group IDs", async () => {
        // Test group document exclusion
        const groupDoc1 = {
            _id: "group123",
            type: DocType.Group,
            acl: [{ type: DocType.Group, groupId: "group1", permission: ["view"] }],
        } as any;
        // Test group document inclusion
        const groupDoc2 = {
            _id: "group124",
            type: DocType.Group,
            acl: [{ type: DocType.Group, groupId: "group2", permission: ["view"] }],
        } as any;
        // Test group change document exclusion
        const groupChangeDoc1 = {
            _id: "groupChange123",
            type: DocType.Change,
            docType: DocType.Group,
            acl: [{ type: DocType.Group, groupId: "group1", permission: ["view"] }],
        } as any;
        // Test group change document inclusion
        const groupChangeDoc2 = {
            _id: "groupChange124",
            type: DocType.Change,
            docType: DocType.Group,
            acl: [{ type: DocType.Group, groupId: "group2", permission: ["view"] }],
        } as any;
        // Test change document exclusion for content documents
        const changeDoc1 = {
            _id: "change1",
            type: DocType.Change,
            docType: DocType.Content,
            memberOf: ["group1"],
        } as any;
        // Test change document inclusion for content documents
        const changeDoc2 = {
            _id: "change2",
            type: DocType.Change,
            docType: DocType.Content,
            memberOf: ["group2"],
        } as any;
        // Test content document exclusion
        const contentDoc1 = {
            _id: "content1",
            type: DocType.Content,
            memberOf: ["group1"],
        } as any;
        // Test content document inclusion
        const contentDoc2 = {
            _id: "content2",
            type: DocType.Content,
            memberOf: ["group2"],
        } as any;

        db.docs.bulkPut([
            groupDoc1,
            groupDoc2,
            groupChangeDoc1,
            groupChangeDoc2,
            contentDoc1,
            contentDoc2,
            changeDoc1,
            changeDoc2,
        ]);
        const repository = new BaseRepository();
        const result1 = await repository.whereNotMemberOf(["group1"], DocType.Content).toArray();
        const result2 = await repository.whereNotMemberOf(["group1"], DocType.Group).toArray();

        // Both the content document and the content change document who are not members of "group1" should be returned
        expect(result1.length).toBe(2);
        expect(result1.some((r) => r._id == contentDoc2._id)).toBe(true);
        expect(result1.some((r) => r._id == changeDoc2._id)).toBe(true);

        // Both the group document and the group change document who are not members of "group1" should be returned
        expect(result2.length).toBe(2);
        expect(result2.some((r) => r._id == groupDoc2._id)).toBe(true);
        expect(result2.some((r) => r._id == groupChangeDoc2._id)).toBe(true);
    });
});
