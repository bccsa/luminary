import initSchemaVersion from "./initSchemaVersion";
import { FRESH_DB_SCHEMA_VERSION } from "./freshDbSchemaVersion";

describe("initSchemaVersion (default startup schema initializer)", () => {
    function mockDb(currentVersion: number) {
        return {
            getSchemaVersion: jest.fn().mockResolvedValue(currentVersion),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
        } as any;
    }

    it("stamps a fresh database (version 0 / no dbSchema doc) at the fresh-DB baseline version", async () => {
        const db = mockDb(0);

        await initSchemaVersion(db);

        expect(db.setSchemaVersion).toHaveBeenCalledTimes(1);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(FRESH_DB_SCHEMA_VERSION);
    });

    it("stamps below the newest backfill so the chain still runs it on seeded data", () => {
        // Guard: the baseline must be exactly one below the newest backfill (v18) so v18 executes
        // on a fresh DB. If a newer backfill is added, bump FRESH_DB_SCHEMA_VERSION accordingly.
        expect(FRESH_DB_SCHEMA_VERSION).toBe(17);
    });

    it("is a no-op on a database that is already initialized (version > 0)", async () => {
        const db = mockDb(18);

        await initSchemaVersion(db);

        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });

    it("is a no-op on a mid-upgrade database (lets the versioned chain run)", async () => {
        const db = mockDb(10);

        await initSchemaVersion(db);

        expect(db.setSchemaVersion).not.toHaveBeenCalled();
    });

    it("re-throws if reading the schema version fails", async () => {
        const db = {
            getSchemaVersion: jest.fn().mockRejectedValue(new Error("boom")),
            setSchemaVersion: jest.fn(),
        } as any;
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();

        await expect(initSchemaVersion(db)).rejects.toThrow("boom");
        expect(db.setSchemaVersion).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
    });
});
