import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";
import { DbService } from "./db/db.service";
import { PermissionSystem } from "./permissions/permissions.service";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const dbService = app.get(DbService);

    // Create or update database design docs on api startup
    await upsertDesignDocs(dbService);

    // TMP: Seed database with demo / initial data
    await upsertSeedingDocs(dbService);

    const dbGroups = await dbService.getGroups();
    PermissionSystem.upsertGroups(dbGroups.docs);

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
