import { afterEach, describe, expect, it, vi } from "vitest";
import { purgeLocalDatabase } from "./purgeLocalDatabase";

const dbMock = vi.hoisted(() => {
    return {
        clear: vi.fn(),
    };
});

vi.mock("@/db/baseDatabase", () => {
    return {
        db: {
            docs: dbMock,
            localChanges: dbMock,
        },
    };
});

describe("purgeLocalDatabase", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("purges the local database", async () => {
        await purgeLocalDatabase();

        expect(dbMock.clear).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem("syncVersion")).toEqual("0");
    });
});
