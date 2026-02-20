import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { DbService } from "./db/db.service";
import { Socketio } from "./socketio";
import { S3Service } from "./s3/s3.service";
import configuration from "./configuration";
import { utilities as nestWinstonModuleUtilities, WinstonModule } from "nest-winston";
import { SearchController } from "./endpoints/search.controller";
import { SearchService } from "./endpoints/search.service";
import { ChangeRequestService } from "./endpoints/changeRequest.service";
import { ChangeRequestController } from "./endpoints/changeRequest.controller";
import * as winston from "winston";
import { QueryService } from "./endpoints/query.service";
import { QueryController } from "./endpoints/query.controller";
import { StorageStatusController } from "./endpoints/storageStatus.controller";

let winstonTransport: winston.transport;
if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    winstonTransport = new winston.transports.Console({
        format: winston.format.combine(
            nestWinstonModuleUtilities.format.nestLike("Luminary", {
                colors: true,
                prettyPrint: true,
            }),
        ),
    });
} else {
    winstonTransport = new winston.transports.File({
        filename: "api.log",
        maxFiles: 5,
        maxsize: 1000000,
        tailable: true,
    });
}

@Module({
    imports: [
        WinstonModule.forRoot({
            level: "info",
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [winstonTransport],
        }),
        ConfigModule.forRoot({
            load: [configuration],
        }),
    ],
    controllers: [
        AppController,
        SearchController,
        ChangeRequestController,
        QueryController,
        StorageStatusController,
    ],
    providers: [DbService, Socketio, S3Service, SearchService, QueryService, ChangeRequestService],
})
export class AppModule {}
