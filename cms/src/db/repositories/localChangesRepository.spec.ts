import "fake-indexeddb/auto";
import { describe, it, afterEach, expect, beforeEach } from "vitest";
import { db } from "../baseDatabase";
import { mockLocalChange1, mockLocalChange2 } from "@/tests/mockData";
import { LocalChangesRepository } from "./localChangesRepository";

describe("localChangesRepository", () => {
    beforeEach(() => {
        db.localChanges.bulkPut([mockLocalChange1, mockLocalChange2]);
    });

    afterEach(() => {
        db.localChanges.clear();
    });

    it("can get all changes", async () => {
        const repository = new LocalChangesRepository();

        const result = await repository.getAll();

        expect(result).toEqual([mockLocalChange1, mockLocalChange2]);
    });

    it("can get a single document", async () => {
        const repository = new LocalChangesRepository();

        const result = await repository.get(mockLocalChange1.id);

        expect(result).toEqual(mockLocalChange1);
    });

    it("can delete a document", async () => {
        const repository = new LocalChangesRepository();

        await repository.delete(mockLocalChange1.id);
        const result = await repository.get(mockLocalChange1.id);

        expect(result).toEqual(undefined);
    });
});
