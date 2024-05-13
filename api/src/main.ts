import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";
import { DbService } from "./db/db.service";
import { PermissionSystem } from "./permissions/permissions.service";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true,
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

    app.enableCors({
        origin: [
            "http://localhost:4174",
            "http://localhost:4175",
            "https://app2.bcc.africa",
            "https://admin.app2.bcc.africa",
        ],
    });
    await app.listen(process.env.PORT);
}
bootstrap();
