import { Test } from "@nestjs/testing";
import { DbService } from "../db/db.service";
import { S3Service } from "../s3/s3.service";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig, S3Config, S3MediaConfig, SyncConfig } from "../configuration";
import * as nano from "nano";
import { upsertDesignDocs, upsertSeedingDocs } from "../db/db.seedingFunctions";
import { Socketio } from "../socketio";
import { jest } from "@jest/globals";
import { PermissionSystem } from "../permissions/permissions.service";
import { WinstonModule } from "nest-winston";
import * as winston from "winston";
import { S3MediaService } from "../s3-media/media.service";

export type testingModuleOptions = {
    dbName?: string;
    s3ImageBucket?: string;
    s3MediaBucket?: string;
};

/**
 * Creates a Nest TestingModule and seeds the associated CouchDB database with testing data
 */
export async function createTestingModule(testName: string) {
    // Create a unique database name for the test
    const connectionString = process.env.DB_CONNECTION_STRING;

    const database = `${process.env.DB_DATABASE_PREFIX ?? "luminary-test"}-${testName}`;

    const n = nano(connectionString);

    const databases = await n.db.list();
    if (databases.find((d) => d == database)) {
        await n.db.destroy(database);
    }
    await n.db.create(database);

    const testingModule = await Test.createTestingModule({
        imports: [
            WinstonModule.forRoot({
                transports: [
                    // At least one logger is needed to prevent winston warnings
                    new winston.transports.Console({
                        level: "none", // Ignore logging console output during tests
                    }),
                ],
            }),
        ],
        providers: [
            DbService,
            Socketio,
            S3Service,
            S3MediaService,
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

                        if (key == "s3") {
                            return {
                                endpoint: process.env.S3_ENDPOINT ?? "localhost",
                                port: parseInt(process.env.S3_PORT, 10) ?? 9000,
                                useSSL: process.env.S3_USE_SSL === "true",
                                accessKey: process.env.S3_ACCESS_KEY,
                                secretKey: process.env.S3_SECRET_KEY,
                            } as S3Config;
                        }

                        if (key == "s3Media") {
                            return {
                                endpoint: process.env.S3_MEDIA_ENDPOINT ?? "localhost",
                                port: parseInt(process.env.S3_MEDIA_PORT, 10) ?? 9000,
                                useSSL: process.env.S3_MEDIA_USE_SSL === "true",
                                accessKey: process.env.S3_MEDIA_ACCESS_KEY,
                                secretKey: process.env.S3_MEDIA_SECRET_KEY,
                            } as S3MediaConfig;
                        }
                    }),
                },
            },
        ],
    }).compile();

    // Create DB Service and seed it
    const dbService = testingModule.get<DbService>(DbService);

    await upsertDesignDocs(dbService);
    await upsertSeedingDocs(dbService);

    await PermissionSystem.init(dbService);

    // Create S3 Service
    const s3Service = testingModule.get<S3Service>(S3Service);
    const s3MediaService = testingModule.get<S3MediaService>(S3MediaService);

    return {
        dbService,
        testingModule,
        s3Service,
        s3MediaService,
    };
}
