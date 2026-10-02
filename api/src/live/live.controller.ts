import { Controller, MessageEvent, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Observable } from "rxjs";
import { LiveAuthGuard } from "./live.guard";
import { LiveService } from "./live.service";

@Controller()
export class LiveController {
    constructor(private readonly live: LiveService) {}

    /** Server-Sent Events feed of live document updates, scoped by the caller's accessMap. */
    @Sse("live")
    @UseGuards(LiveAuthGuard)
    stream(@Req() request: FastifyRequest, @Query("cms") cms?: string): Observable<MessageEvent> {
        return this.live.connect(request.user.accessMap, cms === "1" || cms === "true");
    }
}
