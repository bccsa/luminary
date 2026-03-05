import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.5-flash-lite";

export type SearchAnswerResult = {
    answer: string;
    sourceContentIds: string[];
};

@Injectable()
export class SearchAnswerService {
    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private readonly config: ConfigService,
    ) {}

    /**
     * Ask Gemini for a short definition/explanation suitable for a search "answer box".
     * Optionally grounded in provided context excerpts (e.g. from MiniSearch results).
     */
    async getAnswer(query: string, contextSnippets: string[] = []): Promise<SearchAnswerResult | null> {
        const apiKey = this.config.get<string>("gemini.apiKey");
        if (!apiKey) {
            this.logger.debug("Search answer skipped: GEMINI_API_KEY not set");
            return null;
        }

        const contextBlock =
            contextSnippets.length > 0
                ? `Use the following excerpts from our content when relevant:\n\n${contextSnippets.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}\n\n`
                : "";

        const systemInstruction = `You are a helpful assistant for a Christian content app. Give a brief, clear definition or explanation (2-4 sentences). Be faithful to the Christian tradition. If context excerpts are provided, prefer using them; otherwise give a concise general explanation. Do not invent sources. Reply with only the explanation text, no headings or "Source:" lines.`;

        const userPrompt = `${contextBlock}User query: ${query}`;

        const url = `${GEMINI_API_BASE}/models/${MODEL}:generateContent`;
        const body = {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
                maxOutputTokens: 256,
                temperature: 0.3,
            },
        };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errText = await res.text();
                this.logger.warn(`Gemini API error ${res.status}: ${errText}`);
                return null;
            }

            const data = (await res.json()) as {
                candidates?: Array<{
                    content?: { parts?: Array<{ text?: string }> };
                }>;
            };

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!text) return null;

            return {
                answer: text,
                sourceContentIds: [], // Optional: extract from context later if we pass doc IDs with snippets
            };
        } catch (err) {
            this.logger.error("Search answer request failed", err);
            throw new HttpException(
                "Search answer temporarily unavailable",
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }
}
