import { Controller, MessageEvent, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Observable } from "rxjs";
import { ChangeFeedAuthGuard } from "./changeFeed.guard";
import { ChangeFeedService } from "./changeFeed.service";

@Controller()
export class ChangeFeedController {
    constructor(private readonly live: ChangeFeedService) {}

    /** Server-Sent Events feed of live document updates, scoped by the caller's accessMap. */
    @Sse("live")
    @UseGuards(ChangeFeedAuthGuard)
    stream(
        @Req() request: FastifyRequest,
        @Query("cms") cms?: string,
        @Query("types") types?: string,
    ): Observable<MessageEvent> {
        return this.live.connect(
            request.user.accessMap,
            cms === "1" || cms === "true",
            types?.split(","),
        );
    }
}
