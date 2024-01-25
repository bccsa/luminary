import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { DbService } from "./db/db.service";

@Module({
    imports: [
        ConfigModule.forRoot(),
        JwtModule.register({
            global: true,
        }),
    ],
    controllers: [AppController],
    providers: [DbService],
})
export class AppModule {}
