jest.mock("./schemaUpgrade/v9", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./schemaUpgrade/v10", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./schemaUpgrade/v11", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./schemaUpgrade/v12", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./schemaUpgrade/v13", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));

import { upgradeDbSchema } from "./db.upgrade";
import v9 from "./schemaUpgrade/v9";
import v10 from "./schemaUpgrade/v10";
import v11 from "./schemaUpgrade/v11";
import v12 from "./schemaUpgrade/v12";
import v13 from "./schemaUpgrade/v13";

describe("upgradeDbSchema", () => {
    const mockDb = {} as any;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should call all upgrade functions in order", async () => {
        await upgradeDbSchema(mockDb);

        expect(v9).toHaveBeenCalledWith(mockDb);
        expect(v10).toHaveBeenCalledWith(mockDb);
        expect(v11).toHaveBeenCalledWith(mockDb);
        expect(v12).toHaveBeenCalledWith(mockDb);
        expect(v13).toHaveBeenCalledWith(mockDb);
    });

    it("should re-throw error and log it when an upgrade function fails", async () => {
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();
        const error = new Error("Migration failed");
        (v10 as jest.Mock).mockRejectedValue(error);

        await expect(upgradeDbSchema(mockDb)).rejects.toThrow("Migration failed");
        expect(consoleSpy).toHaveBeenCalledWith("Database schema upgrade failed:", error);

        consoleSpy.mockRestore();
    });
});
