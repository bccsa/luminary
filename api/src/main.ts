import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";
import { DbService } from "./db/db.service";
import { PermissionSystem } from "./permissions/permissions.service";
import { upgradeDbSchema } from "./db/db.upgrade";
import { ValidationPipe } from "@nestjs/common";
import compress from "@fastify/compress";
import multipart from "@fastify/multipart";
import { AllExceptionsFilter } from "./exceptions/allExceptions.filter";
import { S3Service } from "./s3/s3.service";
import { warmIndexNameRegistry } from "./db/indexNameRegistry";

export async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        // trustProxy: derive the client IP from X-Forwarded-For (used to key the
        // anonymous rate-limit bucket). Enable ONLY behind a trusted reverse proxy.
        new FastifyAdapter({ trustProxy: process.env.TRUST_PROXY === "true" }),
        {
            bufferLogs: true,
        },
    );

    // Register multipart plugin for file uploads
    await app.register(multipart, {
        limits: {
            fileSize: parseInt(process.env.MAX_HTTP_BUFFER_SIZE, 10) || 1e7,
        },
    });

    // Register compression plugin (Brotli/gzip) for the query endpoint
    await app.register(compress, {
        encodings: ["br", "gzip", "deflate"],
    });

    const dbService = app.get(DbService);

    // Create or update database design docs on api startup
    await upsertDesignDocs(dbService);

    // Build the use_index allowlist from the design-doc files now, so a packaging
    // mistake that drops the JSON assets fails loudly here instead of silently
    // rejecting every `use_index` at request time.
    warmIndexNameRegistry();

    // Seed database with default data if requested
    if (process.argv.length >= 3 && process.argv[2] === "seed") {
        await upsertSeedingDocs(dbService);
        // Run the schema upgrade chain over the just-seeded data before exiting. Seeding writes
        // raw JSON (it bypasses process*Dto), so without this a freshly-seeded DB has no `dbSchema`
        // doc and no server-side `fts` on its User/Redirect docs — initSchemaVersion stamps the
        // fresh-DB baseline and v18 backfills that index. Safe in seed mode: on a fresh DB only
        // v18 runs, which is DB-only (no S3, no PermissionSystem needed).
        await upgradeDbSchema(dbService);
        console.log("Database seeded with default data.");
        process.exit(0);
    }

    // Initialize permission system
    await PermissionSystem.init(dbService);

    // Wire up S3 singleton cache to DB change feed and disconnect events
    S3Service.initializeChangeListener(dbService);

    // Upgrade database schema if needed
    await upgradeDbSchema(dbService);

    app.enableCors({
        origin: JSON.parse(process.env.CORS_ORIGIN),
        //allowedHeaders might have to be made configurable. The shared client library supports injection of custom headers (use for x-auth-provider-id and the Authorization header), and could potentially be used for other custom headers as well.
        allowedHeaders: ["Authorization", "Content-Type", "x-auth-provider-id"],
    });

    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.listen(process.env.PORT, "0.0.0.0");
}
/* istanbul ignore next */
if (require.main === module) {
    bootstrap();
}
