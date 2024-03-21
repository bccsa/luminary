import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from "vitest";
import { useSocketConnectionStore } from "./socketConnection";
import { AclPermission, DocType } from "@/types";
import { db } from "@/db/baseDatabase";
import waitForExpect from "wait-for-expect";
import { createPinia, setActivePinia } from "pinia";

const socketMocks = vi.hoisted(() => ({
    emit: vi.fn(),
    on: vi.fn(),
}));

vi.mock("@/socket", () => ({
    getSocket: () => socketMocks,
    setSocket: () => socketMocks,
}));

// Invoke the callback for socket.on() only for the passed event
function listenToSocketOnEvent(allowedEvent: string | string[], returnValue?: any) {
    if (typeof allowedEvent == "string") {
        allowedEvent = [allowedEvent];
    }
    socketMocks.on = vi.fn().mockImplementation((socketEvent, callback) => {
        if (allowedEvent.includes(socketEvent)) {
            callback(returnValue);
        }
    });
}

describe("deleteRevokedDocs", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("removes documents with memberOf field when access to a group is revoked", async () => {
        const docs = [
            {
                _id: "doc1",
                type: DocType.Post, // Test Post documents
                memberOf: ["group-private-users"],
                updatedTimeUtc: 0,
            },
            {
                _id: "doc2",
                type: DocType.Tag, // Test Tag documents
                memberOf: ["group-private-users"],
                updatedTimeUtc: 0,
            },
            {
                _id: "doc3",
                type: DocType.Content, // Test Content documents
                parentId: "doc1",
                updatedTimeUtc: 0,
            },
            {
                _id: "doc4",
                type: DocType.Change, // Test change documents of type Post
                memberOf: ["group-private-users"],
                docType: DocType.Post,
                updatedTimeUtc: 0,
            },
            {
                _id: "doc5",
                type: DocType.Change, // Test change documents of type Content
                docType: DocType.Content,
                parentId: "doc2",
                updatedTimeUtc: 0,
            },
            {
                _id: "doc6",
                type: DocType.Post,
                memberOf: ["group-private-users", "group-public-users"], // This document should not be removed as it is also a member of 'group-public-users'
                updatedTimeUtc: 0,
            },
            {
                _id: "doc7",
                type: DocType.Content,
                parentId: "doc6", // This document should not be removed as it's parent is also a member of 'group-public-users'
                updatedTimeUtc: 0,
            },
        ];
        await db.docs.bulkPut(docs);

        // Simulate receiving an accessMap update that only gives access to 'group-public-users'
        const accessMap = {
            "group-public-users": {
                [DocType.Post]: {
                    view: true,
                    assign: true,
                },
            },
        };

        const store = useSocketConnectionStore();
        listenToSocketOnEvent("accessMap", accessMap);
        store.bindEvents();

        await waitForExpect(async () => {
            const remainingDocs = await db.docs.toArray();
            expect(remainingDocs).toHaveLength(2);
            expect(remainingDocs.find((doc) => doc._id === "doc6")).toBeDefined();
            expect(remainingDocs.find((doc) => doc._id === "doc7")).toBeDefined();
        });
    });

    it("removes content documents when access to the language document is revoked", async () => {
        const docs = [
            {
                _id: "doc1",
                type: DocType.Post, // Parent document - will not be removed as it is a member of 'group-public-users'
                memberOf: ["group-public-users"],
                updatedTimeUtc: 0,
            },
            {
                _id: "doc2",
                type: DocType.Tag, // Parent document - will not be removed as it is a member of 'group-public-users'
                memberOf: ["group-public-users"],
                updatedTimeUtc: 0,
            },
            {
                _id: "doc3",
                type: DocType.Content, // Test Content documents for Posts - should be removed as access to the language is revoked
                parentId: "doc1",
                updatedTimeUtc: 0,
                language: "lang1",
            },
            {
                _id: "doc4",
                type: DocType.Content, // Test Content documents for Tags - should be removed as access to the language is revoked
                parentId: "doc2",
                updatedTimeUtc: 0,
                language: "lang1",
            },
            {
                _id: "doc5",
                type: DocType.Content, // Test Content documents for Posts - should NOT be removed as access to the language is not revoked
                parentId: "doc1",
                updatedTimeUtc: 0,
                language: "lang2",
            },
            {
                _id: "doc6",
                type: DocType.Change, // Test content Change docs - should be removed as access to the language is revoked
                parentId: "doc1",
                updatedTimeUtc: 0,
                language: "lang1",
            },
            {
                _id: "doc7",
                type: DocType.Change, // Test content Change docs - should NOT be removed as access to the language NOT revoked
                parentId: "doc1",
                updatedTimeUtc: 0,
                language: "lang2",
            },
            {
                _id: "lang1",
                type: DocType.Language, // Test Language document - will be removed as it is not a member of 'group-public-users'
                memberOf: ["group-private-users"],
                updatedTimeUtc: 0,
            },
            {
                _id: "lang2",
                type: DocType.Language, // Test Language document - will not be removed as it is a member of 'group-public-users'
                memberOf: ["group-public-users"],
                updatedTimeUtc: 0,
            },
        ];
        await db.docs.bulkPut(docs);

        // Simulate receiving an accessMap update that only gives access to 'group-public-users'
        const accessMap = {
            "group-public-users": {
                [DocType.Post]: {
                    view: true,
                    assign: true,
                },
                [DocType.Tag]: {
                    view: true,
                },
                [DocType.Language]: {
                    view: true,
                },
            },
        };

        const store = useSocketConnectionStore();
        listenToSocketOnEvent("accessMap", accessMap);
        store.bindEvents();

        await waitForExpect(async () => {
            const remainingDocs = await db.docs.toArray();
            expect(remainingDocs).toHaveLength(5);
            expect(remainingDocs.find((doc) => doc._id === "doc1")).toBeDefined();
            expect(remainingDocs.find((doc) => doc._id === "doc2")).toBeDefined();
            expect(remainingDocs.find((doc) => doc._id === "doc5")).toBeDefined();
            expect(remainingDocs.find((doc) => doc._id === "doc7")).toBeDefined();
            expect(remainingDocs.find((doc) => doc._id === "lang2")).toBeDefined();
        });
    });

    it("removes documents with acl field when access to a group is revoked", async () => {
        const docs = [
            {
                _id: "group1", // Should be removed as it is not a member of 'group-public-users'
                type: DocType.Group,
                acl: [
                    {
                        type: DocType.Group,
                        groupId: "group-private-users",
                        permission: [AclPermission.View],
                    },
                ],
                updatedTimeUtc: 0,
            },
            {
                _id: "group2", // Should be kept as it is a member of 'group-public-users'
                type: DocType.Group,
                acl: [
                    {
                        type: DocType.Group,
                        groupId: "group-public-users",
                        permission: [AclPermission.View],
                    },
                ],
                updatedTimeUtc: 0,
            },
            {
                _id: "group3", // Should be removed as it is not a member of 'group-public-users'
                type: DocType.Change,
                docType: DocType.Group,
                acl: [
                    {
                        type: DocType.Group,
                        groupId: "group-private-users",
                        permission: [AclPermission.View],
                    },
                ],
                updatedTimeUtc: 0,
            },
        ];
        await db.docs.bulkPut(docs);

        // Simulate receiving an accessMap update that only gives access to 'group-public-users'
        const accessMap = {
            "group-public-users": {
                [DocType.Group]: {
                    view: true,
                    assign: true,
                },
            },
        };

        const store = useSocketConnectionStore();
        listenToSocketOnEvent("accessMap", accessMap);
        store.bindEvents();

        await waitForExpect(async () => {
            const remainingDocs = await db.docs.toArray();
            expect(remainingDocs).toHaveLength(1);
            expect(remainingDocs.find((doc) => doc._id === "group2")).toBeDefined();
        });
    });
});
