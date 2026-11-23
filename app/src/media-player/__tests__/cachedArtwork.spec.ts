import { describe, expect, it, vi } from "vitest";
import type { ContentDto } from "luminary-shared";
import type { DownloadsService } from "@/build-time/contracts/downloads/contract";

vi.mock("@/util/fallbackArtwork", () => ({
    fallbackArtworkDataUrl: vi.fn(async () => "data:fallback"),
}));

import { offlineCoverDataUrl, storedArtworkPath } from "../cachedArtwork";

const content = { _id: "c1", parentId: "p1" } as ContentDto;
const serviceWith = (artwork: string | undefined, read: string | undefined) =>
    ({
        entryFor: (parentId: string) =>
            parentId === "p1" ? { downloadId: "d1", content: { artwork } } : undefined,
        artwork: vi.fn(async () => read),
    }) as unknown as DownloadsService;

describe("offline cover", () => {
    it("uses the picture the download stored", async () => {
        const service = serviceWith("item/art/a.webp", "data:stored");
        expect(storedArtworkPath(service, content)).toBe("item/art/a.webp");
        expect(await offlineCoverDataUrl(service, content, undefined)).toBe("data:stored");
        expect(service.artwork).toHaveBeenCalledWith("d1");
    });

    it("falls back without a stored picture, or when it cannot be read", async () => {
        expect(
            await offlineCoverDataUrl(serviceWith(undefined, undefined), content, undefined),
        ).toBe("data:fallback");
        expect(
            await offlineCoverDataUrl(
                serviceWith("item/art/a.webp", undefined),
                content,
                undefined,
            ),
        ).toBe("data:fallback");
        expect(await offlineCoverDataUrl(undefined, content, undefined)).toBe("data:fallback");
    });
});
