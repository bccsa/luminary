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
jest.mock("./db/languageSeedReconciliation", () => ({
    reconcileLanguageTranslationSeeds: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@fastify/compress", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@fastify/multipart", () => ({ __esModule: true, default: jest.fn() }));

import { NestFactory } from "@nestjs/core";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";
import { PermissionSystem } from "./permissions/permissions.service";
import { upgradeDbSchema } from "./db/db.upgrade";
import { reconcileLanguageTranslationSeeds } from "./db/languageSeedReconciliation";
import { bootstrap } from "./main";
import { constants } from "zlib";

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
        expect(reconcileLanguageTranslationSeeds).toHaveBeenCalled();
        expect(mockApp.enableCors).toHaveBeenCalled();
        expect(mockApp.listen).toHaveBeenCalledWith("3000", "0.0.0.0");
    });

    it("should register compression with an explicit Brotli quality", async () => {
        process.argv = ["node", "main.js"];
        process.env.COMPRESS_BROTLI_QUALITY = "7";

        await bootstrap();

        const [, options] = mockApp.register.mock.calls.find(
            ([, opts]: [unknown, any]) => opts?.encodings,
        );
        expect(options.encodings).toEqual(["br", "gzip", "deflate"]);
        expect(options.brotliOptions.params[constants.BROTLI_PARAM_QUALITY]).toBe(7);
    });

    it("should default the Brotli quality above the plugin's own default", async () => {
        process.argv = ["node", "main.js"];
        delete process.env.COMPRESS_BROTLI_QUALITY;

        await bootstrap();

        const [, options] = mockApp.register.mock.calls.find(
            ([, opts]: [unknown, any]) => opts?.encodings,
        );
        expect(options.brotliOptions.params[constants.BROTLI_PARAM_QUALITY]).toBe(6);
    });

    it("should seed and exit when 'seed' argument is provided", async () => {
        process.argv = ["node", "main.js", "seed"];
        // process.exit never returns in reality, so the mock must actually halt bootstrap() here
        // too — otherwise this test can't distinguish the seed branch from execution falling
        // through into the rest of bootstrap().
        const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit called");
        });
        const consoleSpy = jest.spyOn(console, "log").mockImplementation();

        await expect(bootstrap()).rejects.toThrow("process.exit called");

        expect(upsertSeedingDocs).toHaveBeenCalled();
        // The schema upgrade chain must run over the freshly-seeded data before exiting, so a
        // fresh DB is stamped and its User/Redirect docs get the server-side fts backfill (v18).
        expect(upgradeDbSchema).toHaveBeenCalled();
        // Seeding upserts only the seeded language docs (lang-*) with their exact seed-file
        // translations, so reconciling those here would be a no-op. Reconcile also backfills/prunes
        // custom (non-seeded) languages, but that runs on the next normal bootstrap() (main.ts:70),
        // which is good enough — so the seed pass intentionally skips it. See the other test.
        expect(reconcileLanguageTranslationSeeds).not.toHaveBeenCalled();
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
