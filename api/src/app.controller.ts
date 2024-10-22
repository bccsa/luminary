import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth/auth.guard";

@Controller()
export class AppController {
    @UseGuards(AuthGuard)
    @Get("/protected")
    getProtected(): string {
        return "You've successfully requested a response with a JWT :)";
    }

    //Send an event through to the api when a user tries to access a slug that has a place to redirect to from Socket.io in luminary-shared
    //Send a 301/302 status code to the client depending on RedirectType alongside the new data
    /*
        
    */
}
