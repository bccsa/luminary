import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";
import { DbService } from "./db/db.service";
import { PermissionSystem } from "./permissions/permissions.service";
import { upgradeDbSchema } from "./db/db.upgrade";
import { S3Service } from "./s3/s3.service";
import { ValidationPipe } from "@nestjs/common";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true,
    });

    const dbService = app.get(DbService);
    const s3Service = app.get(S3Service);

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

    // Upgrade database schema if needed
    await upgradeDbSchema(dbService, s3Service);

    app.enableCors({
        origin: JSON.parse(process.env.CORS_ORIGIN),
        allowedHeaders: ["X-Query", "Authorization", "Content-Type"],
    });

    app.useGlobalPipes(new ValidationPipe());

    await app.listen(process.env.PORT);
}
bootstrap();
