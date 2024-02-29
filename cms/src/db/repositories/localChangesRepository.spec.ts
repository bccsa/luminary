import "fake-indexeddb/auto";
import { describe, it, afterEach, expect, beforeEach } from "vitest";
import { db } from "../baseDatabase";
import { mockLocalChange1, mockLocalChange2 } from "@/tests/mockData";
import { LocalChangesRepository } from "./localChangesRepository";
import { LocalChangeStatus } from "@/types";

describe("localChangesRepository", () => {
    beforeEach(() => {
        db.localChanges.bulkPut([mockLocalChange1, mockLocalChange2]);
    });

    afterEach(() => {
        db.localChanges.clear();
    });

    it("can get all unsynced changes", async () => {
        const repository = new LocalChangesRepository();

        const result = await repository.getUnsynced();

        expect(result).toEqual([mockLocalChange1, mockLocalChange2]);
    });

    it("can get all syncing changes", async () => {
        const syncingChange = {
            ...mockLocalChange1,
            status: LocalChangeStatus.Syncing,
        };
        db.localChanges.put(syncingChange);
        const repository = new LocalChangesRepository();

        const result = await repository.getSyncing();

        expect(result).toEqual([syncingChange]);
    });

    it("can get a single document", async () => {
        const repository = new LocalChangesRepository();

        const result = await repository.get(mockLocalChange1.id);

        expect(result).toEqual(mockLocalChange1);
    });

    it("can update a document", async () => {
        const repository = new LocalChangesRepository();

        await repository.update(mockLocalChange1, {
            status: LocalChangeStatus.Syncing,
        });
        const result = await repository.get(mockLocalChange1.id);

        expect(result).toEqual({
            ...mockLocalChange1,
            status: LocalChangeStatus.Syncing,
        });
    });

    it("can delete a document", async () => {
        const repository = new LocalChangesRepository();

        await repository.delete(mockLocalChange1.id);
        const result = await repository.get(mockLocalChange1.id);

        expect(result).toEqual(undefined);
    });
});
