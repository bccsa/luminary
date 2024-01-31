import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth/auth.guard";

@Controller()
export class AppController {
    @UseGuards(AuthGuard)
    @Get("/protected")
    getProtected(): string {
        return "You've successfully requested a response with a JWT :)";
    }
}
