import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
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
