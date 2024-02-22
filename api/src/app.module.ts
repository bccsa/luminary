import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { DbService } from "./db/db.service";
import { Socketio } from "./socketio";
import configuration from "./configuration";

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [configuration],
        }),
        JwtModule.register({
            global: true,
        }),
    ],
    controllers: [AppController],
    providers: [DbService, Socketio],
})
export class AppModule {}
