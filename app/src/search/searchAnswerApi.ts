import { apiUrl } from "@/globalConfig";

export type SearchAnswerResponse = {
    answer: string;
    sourceContentIds: string[];
} | null;

/**
 * Fetches an AI-generated short answer for "meaning of X" / question-style queries.
 * Returns null if the API is unavailable or the response is empty.
 */
export async function fetchSearchAnswer(query: string): Promise<SearchAnswerResponse> {
    const base = (apiUrl || "").replace(/\/$/, "");
    if (!base) return null;

    const url = `${base}/search/answer?q=${encodeURIComponent(query.trim())}`;
    try {
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || typeof data.answer !== "string") return null;
        return {
            answer: data.answer,
            sourceContentIds: Array.isArray(data.sourceContentIds) ? data.sourceContentIds : [],
        };
    } catch {
        return null;
    }
}
