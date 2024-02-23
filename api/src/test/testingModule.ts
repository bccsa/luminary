import { Test } from "@nestjs/testing";
import { DbService } from "../db/db.service";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig, SyncConfig } from "../configuration";
import * as nano from "nano";
import { upsertDesignDocs, upsertSeedingDocs } from "../db/db.seedingFunctions";
import { Socketio } from "../socketio";
import { jest } from "@jest/globals";
import { PermissionSystem } from "../permissions/permissions.service";

/**
 * Creates a Nest TestingModule and a specific database and seeds it
 */
export async function createTestingModule(dbName: string) {
    const connectionString = process.env.DB_CONNECTION_STRING;
    const database = `${process.env.DB_DATABASE ?? "ac-test"}-${dbName}`;

    const n = await nano(connectionString);

    const databases = await n.db.list();
    if (databases.find((d) => d == database)) {
        await n.db.destroy(database);
    }
    await n.db.create(database);

    const testingModule = await Test.createTestingModule({
        providers: [
            DbService,
            Socketio,
            {
                provide: ConfigService,
                useValue: {
                    get: jest.fn((key: string) => {
                        if (key == "sync") {
                            return {
                                tolerance: 1000,
                            } as SyncConfig;
                        }

                        if (key == "database") {
                            return {
                                connectionString,
                                database,
                            } as DatabaseConfig;
                        }
                    }),
                },
            },
        ],
    }).compile();

    const dbService = testingModule.get<DbService>(DbService);

    await upsertDesignDocs(dbService);
    await upsertSeedingDocs(dbService);

    const dbGroups = await dbService.getGroups();
    PermissionSystem.upsertGroups(dbGroups.docs);

    return {
        dbService,
        testingModule,
    };
}
