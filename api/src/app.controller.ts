import { Controller, Get, UseGuards } from "@nestjs/common";
import { AppService } from "./app.service";
import { AuthGuard } from "./auth/auth.guard";

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get("/test")
    getHello(): string {
        return this.appService.getHello();
    }

    @UseGuards(AuthGuard)
    @Get("/protected")
    getProtected(): string {
        return "You've successfully requested a response with a JWT :)";
    }
}
