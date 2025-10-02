import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, computed } from "vue";
import { useDexieLiveQueryAsEditable } from "./useDexieLiveQueryAsEditable";
import { BaseDocumentDto, DocType, Uuid } from "../../types";
import waitForExpect from "wait-for-expect";

// Mock dependencies
vi.mock("../useDexieLiveQuery", () => ({
    useDexieLiveQuery: vi.fn(),
    useDexieLiveQueryWithDeps: vi.fn(),
}));

vi.mock("../createEditable", () => ({
    createEditable: vi.fn(),
}));

vi.mock("../../db/database", () => ({
    db: {
        upsert: vi.fn(),
        localChanges: {
            where: vi.fn(),
        },
    },
}));

type TestDocType = BaseDocumentDto & { name: string; value: number };

describe("useDexieLiveQueryAsEditable", async () => {
    const mockUseDexieLiveQuery = vi.mocked(await import("../useDexieLiveQuery")).useDexieLiveQuery;
    const mockUseDexieLiveQueryWithDeps = vi.mocked(
        await import("../useDexieLiveQuery"),
    ).useDexieLiveQueryWithDeps;
    const mockCreateEditable = vi.mocked(await import("../createEditable")).createEditable;
    const mockDb = vi.mocked(await import("../../db/database")).db;

    const mockDocs: TestDocType[] = [
        { _id: "1" as Uuid, updatedTimeUtc: 0, type: DocType.Post, name: "Test 1", value: 10 },
        { _id: "2" as Uuid, updatedTimeUtc: 0, type: DocType.Post, name: "Test 2", value: 20 },
    ];

    const mockSource = ref(mockDocs);
    const mockEditable = ref([...mockDocs]);
    const mockIsEditedFn = vi.fn();
    const mockIsEdited = computed(() => mockIsEditedFn);
    const mockIsModifiedFn = vi.fn();
    const mockIsModified = computed(() => mockIsModifiedFn);
    const mockUpdateShadow = vi.fn();

    beforeEach(() => {
        mockUseDexieLiveQuery.mockReturnValue(mockSource);
        mockCreateEditable.mockReturnValue({
            editable: mockEditable,
            isEdited: mockIsEdited,
            updateShadow: mockUpdateShadow,
            isModified: mockIsModified,
            revert: vi.fn(),
        });

        vi.mocked(mockDb.upsert).mockResolvedValue(undefined);
        vi.mocked(mockDb.localChanges.where).mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
        } as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should create a live query without dependencies", () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        const options = { immediate: true };

        const result = useDexieLiveQueryAsEditable(querier, options);

        expect(mockUseDexieLiveQuery).toHaveBeenCalledWith(querier, options);
        expect(mockUseDexieLiveQueryWithDeps).not.toHaveBeenCalled();
        expect(mockCreateEditable).toHaveBeenCalledWith(mockSource);
        expect(result.source).toBe(mockSource);
        expect(result.editable).toBe(mockEditable);
        expect(result.isEdited).toBe(mockIsEdited);
        expect(result.updateShadow).toBe(mockUpdateShadow);
        expect(result.save).toBeDefined();
        expect(result.isLocalChange).toBeDefined();
    });

    it("should create a live query with dependencies", () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        const options = { immediate: true };
        const deps = ref("dependency");

        const result = useDexieLiveQueryAsEditable(querier, options, deps);

        expect(mockUseDexieLiveQueryWithDeps).toHaveBeenCalledWith(deps, querier, options);
        expect(mockUseDexieLiveQuery).not.toHaveBeenCalled();
        waitForExpect(() => {
            expect(result.source).toBe(mockSource);
        });
    });

    it("should return accepted when item is not edited", async () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        mockIsEditedFn.mockReturnValue(false);
        mockIsEdited.value.mockReturnValue(false);

        const { save } = useDexieLiveQueryAsEditable(querier);

        const result = await save("1" as Uuid);

        expect(result).toEqual({ ack: "accepted" });
        expect(mockDb.upsert).not.toHaveBeenCalled();
        expect(mockUpdateShadow).not.toHaveBeenCalled();
    });

    it("should return rejected when item is not found", async () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        mockIsEditedFn.mockReturnValue(true);
        mockIsEdited.value.mockReturnValue(true);
        mockEditable.value = [];

        const { save } = useDexieLiveQueryAsEditable(querier);

        const result = await save("1" as Uuid);

        expect(result).toEqual({ ack: "rejected", message: "Item not found" });
        expect(mockDb.upsert).not.toHaveBeenCalled();
        expect(mockUpdateShadow).not.toHaveBeenCalled();
    });

    it("should save item successfully when edited and found", async () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        mockIsEditedFn.mockReturnValue(true);
        mockIsEdited.value.mockReturnValue(true);
        const editedItem = { ...mockDocs[0], name: "Updated Test 1" };
        mockEditable.value = [editedItem, mockDocs[1]];

        const { save } = useDexieLiveQueryAsEditable(querier);

        const result = await save("1" as Uuid);

        expect(result).toEqual({
            ack: "accepted",
            message: "Saved locally and queued for upload to the server",
        });
        expect(mockDb.upsert).toHaveBeenCalledWith({
            doc: editedItem,
            overwriteLocalChanges: true,
        });
        expect(mockUpdateShadow).toHaveBeenCalledWith("1");
    });

    it("should handle database upsert errors", async () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        mockIsEditedFn.mockReturnValue(true);
        mockIsEdited.value.mockReturnValue(true);
        const editedItem = { ...mockDocs[0], name: "Updated Test 1" };
        mockEditable.value = [editedItem];
        vi.mocked(mockDb.upsert).mockRejectedValue(new Error("Database error"));

        const { save } = useDexieLiveQueryAsEditable(querier);

        await expect(save("1" as Uuid)).rejects.toThrow("Database error");
        expect(mockUpdateShadow).not.toHaveBeenCalled();
    });

    it("should create isLocalChange function that queries local changes", () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        const mockLocalChangeQuery = ref(false);

        // Mock the nested useDexieLiveQuery call for isLocalChange
        mockUseDexieLiveQuery
            .mockReturnValueOnce(mockSource) // First call for main query
            .mockReturnValueOnce(mockLocalChangeQuery); // Second call for isLocalChange

        const { isLocalChange } = useDexieLiveQueryAsEditable(querier);

        const result = isLocalChange("1" as Uuid);

        expect(result).toBe(mockLocalChangeQuery);
        expect(mockUseDexieLiveQuery).toHaveBeenCalledTimes(2);
        expect(mockUseDexieLiveQuery).toHaveBeenLastCalledWith(expect.any(Function), {
            initialValue: false,
        });
    });

    it("should query local changes correctly in isLocalChange", async () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        const mockWhere = vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ docId: "1" }),
        });
        mockDb.localChanges.where = mockWhere;

        let capturedQuerier: (() => Promise<boolean>) | undefined;
        mockUseDexieLiveQuery
            .mockReturnValueOnce(mockSource)
            .mockImplementationOnce((querierFn) => {
                capturedQuerier = querierFn as () => Promise<boolean>;
                return ref(true);
            });

        const { isLocalChange } = useDexieLiveQueryAsEditable(querier);
        isLocalChange("1" as Uuid);

        // Execute the captured querier function
        if (capturedQuerier) {
            const result = await capturedQuerier();
            expect(result).toBe(true);
            expect(mockWhere).toHaveBeenCalledWith({ docId: "1" });
        }
    });

    it("should return false for isLocalChange when no local change exists", async () => {
        const querier = vi.fn().mockReturnValue(mockDocs);
        const mockWhere = vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
        });
        mockDb.localChanges.where = mockWhere;

        let capturedQuerier: (() => Promise<boolean>) | undefined;
        mockUseDexieLiveQuery
            .mockReturnValueOnce(mockSource)
            .mockImplementationOnce((querierFn) => {
                capturedQuerier = querierFn as () => Promise<boolean>;
                return ref(false);
            });

        const { isLocalChange } = useDexieLiveQueryAsEditable(querier);
        isLocalChange("2" as Uuid);

        // Execute the captured querier function
        if (capturedQuerier) {
            const result = await capturedQuerier();
            expect(result).toBe(false);
            expect(mockWhere).toHaveBeenCalledWith({ docId: "2" });
        }
    });

    it("should use default options when none provided", () => {
        const querier = vi.fn().mockReturnValue(mockDocs);

        useDexieLiveQueryAsEditable(querier);

        expect(mockUseDexieLiveQuery).toHaveBeenCalledWith(querier, {});
    });

    it("should handle Promise-returning querier", async () => {
        const promiseQuerier = vi.fn().mockResolvedValue(mockDocs);

        const { save } = useDexieLiveQueryAsEditable(promiseQuerier);

        expect(mockUseDexieLiveQuery).toHaveBeenCalledWith(promiseQuerier, {});
        expect(save).toBeDefined();
    });
});
