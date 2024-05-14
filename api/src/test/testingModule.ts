import { Test } from "@nestjs/testing";
import { DbService } from "../db/db.service";
import { S3Service } from "../s3/s3.service";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig, SyncConfig } from "../configuration";
import * as nano from "nano";
import { upsertDesignDocs, upsertSeedingDocs } from "../db/db.seedingFunctions";
import { Socketio } from "../socketio";
import { jest } from "@jest/globals";
import { PermissionSystem } from "../permissions/permissions.service";
import { WinstonModule } from "nest-winston";
import * as winston from "winston";

/**
 * Creates a Nest TestingModule and a specific database and seeds it
 */
export async function createDbTestingModule(dbName: string) {
    const connectionString = process.env.DB_CONNECTION_STRING;
    const database = `${process.env.DB_DATABASE_PREFIX ?? "luminary-test"}-${dbName}`;

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

    await PermissionSystem.init(dbService);

    return {
        dbService,
        testingModule,
    };
}

/**
 * Creates a Nest TestingModule with a S3 storage service
 */
export async function createS3TestingModule() {
    const testingModule = await Test.createTestingModule({
        providers: [
            S3Service,
            {
                provide: ConfigService,
                useValue: {
                    get: jest.fn((key: string) => {
                        if (key == "s3") {
                            return {
                                endpoint: process.env.S3_ENDPOINT ?? "localhost",
                                port: parseInt(process.env.S3_PORT, 10) ?? 9000,
                                useSSL: process.env.S3_USE_SSL === "true" ?? false,
                                accessKey: process.env.S3_ACCESS_KEY,
                                secretKey: process.env.S3_SECRET_KEY,
                                imageBucket: process.env.S3_IMG_BUCKET,
                            };
                        }
                    }),
                },
            },
        ],
    }).compile();

    const s3Service = testingModule.get<S3Service>(S3Service);

    return {
        s3Service,
        testingModule,
    };
}
