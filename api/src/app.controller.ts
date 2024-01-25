import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth/auth.guard";
import { DbService } from "./db/db.service";

@Controller()
export class AppController {
    constructor(private dbService: DbService) {}

    // @Get("/test")
    // getHello(): string {
    //     return this.dataService.getHello();
    // }

    @UseGuards(AuthGuard)
    @Get("/protected")
    getProtected(): string {
        return "You've successfully requested a response with a JWT :)";
    }
}
