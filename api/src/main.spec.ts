jest.mock("@nestjs/core", () => ({
    NestFactory: { create: jest.fn() },
}));
jest.mock("@nestjs/platform-fastify", () => ({
    FastifyAdapter: jest.fn(),
}));
jest.mock("./app.module", () => ({ AppModule: class {} }));
jest.mock("./db/db.seedingFunctions", () => ({
    upsertDesignDocs: jest.fn().mockResolvedValue(undefined),
    upsertSeedingDocs: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./db/db.service", () => ({ DbService: jest.fn() }));
jest.mock("./permissions/permissions.service", () => ({
    PermissionSystem: { init: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("./db/db.upgrade", () => ({
    upgradeDbSchema: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@fastify/compress", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@fastify/multipart", () => ({ __esModule: true, default: jest.fn() }));

import { NestFactory } from "@nestjs/core";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";
import { PermissionSystem } from "./permissions/permissions.service";
import { upgradeDbSchema } from "./db/db.upgrade";
import { bootstrap } from "./main";

describe("bootstrap", () => {
    let mockApp: any;
    let originalArgv: string[];
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        jest.clearAllMocks();

        originalArgv = [...process.argv];
        originalEnv = { ...process.env };

        process.env.MAX_HTTP_BUFFER_SIZE = "10000000";
        process.env.CORS_ORIGIN = '["http://localhost"]';
        process.env.PORT = "3000";

        mockApp = {
            register: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockReturnValue({ on: jest.fn() }),
            enableCors: jest.fn(),
            useGlobalPipes: jest.fn(),
            useGlobalFilters: jest.fn(),
            listen: jest.fn().mockResolvedValue(undefined),
        };

        (NestFactory.create as jest.Mock).mockResolvedValue(mockApp);
    });

    afterEach(() => {
        process.argv = originalArgv;
        process.env = originalEnv;
    });

    it("should bootstrap the application normally", async () => {
        process.argv = ["node", "main.js"];

        await bootstrap();

        expect(NestFactory.create).toHaveBeenCalled();
        expect(mockApp.register).toHaveBeenCalledTimes(2);
        expect(upsertDesignDocs).toHaveBeenCalled();
        expect(PermissionSystem.init).toHaveBeenCalled();
        expect(upgradeDbSchema).toHaveBeenCalled();
        expect(mockApp.enableCors).toHaveBeenCalled();
        expect(mockApp.listen).toHaveBeenCalledWith("3000", "0.0.0.0");
    });

    it("should seed and exit when 'seed' argument is provided", async () => {
        process.argv = ["node", "main.js", "seed"];
        const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {}) as any);
        const consoleSpy = jest.spyOn(console, "log").mockImplementation();

        await bootstrap();

        expect(upsertSeedingDocs).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(0);
        expect(consoleSpy).toHaveBeenCalledWith("Database seeded with default data.");

        mockExit.mockRestore();
        consoleSpy.mockRestore();
    });

    it("should not seed when no seed argument", async () => {
        process.argv = ["node", "main.js"];

        await bootstrap();

        expect(upsertSeedingDocs).not.toHaveBeenCalled();
    });
});
