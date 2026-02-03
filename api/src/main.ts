import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";
import { DbService } from "./db/db.service";
import { PermissionSystem } from "./permissions/permissions.service";
import { S3Service } from "./s3/s3.service";
import { ValidationPipe } from "@nestjs/common";
import compress from "@fastify/compress";
import multipart from "@fastify/multipart";

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
        bufferLogs: true,
    });

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

    // Seed database with default data if requested
    if (process.argv.length >= 3 && process.argv[2] === "seed") {
        await upsertSeedingDocs(dbService);
        console.log("Database seeded with default data.");
        process.exit(0);
    }

    // Initialize permission system
    await PermissionSystem.init(dbService);

    // Initialize S3Service change feed listener for automatic credential updates
    S3Service.initializeChangeListener(dbService);

    app.enableCors({
        origin: JSON.parse(process.env.CORS_ORIGIN),
        allowedHeaders: ["X-Query", "Authorization", "Content-Type"],
    });

    app.useGlobalPipes(new ValidationPipe());

    await app.listen(process.env.PORT, "0.0.0.0");
}
bootstrap();
