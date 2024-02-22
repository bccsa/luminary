import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { upsertDesignDocs, upsertSeedingDocs } from "./db/db.seedingFunctions";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Create or update database design docs on api startup
    await upsertDesignDocs(app);

    // TMP: Seed database with demo / initial data
    await upsertSeedingDocs(app);

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
