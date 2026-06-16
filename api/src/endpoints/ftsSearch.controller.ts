import { Controller, Post, Body, UseGuards, HttpCode, Req } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { FtsSearchService } from "./ftsSearch.service";
import { AuthGuard } from "../auth/auth.guard";
import { FtsSearchReqDto } from "../dto/FtsSearchReqDto";
import { FtsSearchResultDto } from "../dto/FtsSearchResultDto";
import { validateApiVersion } from "../validation/apiVersion";

/** Endpoint for server-side full-text search (complements offline/local FTS). */
@Controller("fts")
export class FtsSearchController {
    constructor(private readonly ftsSearchService: FtsSearchService) {}

    @Post()
    @UseGuards(AuthGuard)
    @HttpCode(200) // enable gzip compression by downstream reverse proxy servers
    async search(
        @Body() body: FtsSearchReqDto,
        @Req() request: FastifyRequest,
    ): Promise<FtsSearchResultDto[]> {
        await validateApiVersion(body.apiVersion);
        return this.ftsSearchService.search(body, request.user);
    }
}
