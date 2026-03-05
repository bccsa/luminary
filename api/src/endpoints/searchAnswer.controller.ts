import { Controller, Get, Query } from "@nestjs/common";
import { SearchAnswerService } from "./searchAnswer.service";

@Controller("search")
export class SearchAnswerController {
    constructor(private readonly searchAnswerService: SearchAnswerService) {}

    /**
     * GET /search/answer?q=...
     * Returns a short AI-generated definition/explanation for "meaning of X" style queries.
     * No auth required so the search results page works for all users.
     */
    @Get("answer")
    async getAnswer(@Query("q") q: string): Promise<{ answer: string; sourceContentIds: string[] } | null> {
        const trimmed = typeof q === "string" ? q.trim() : "";
        if (!trimmed) return null;
        return this.searchAnswerService.getAnswer(trimmed);
    }
}
