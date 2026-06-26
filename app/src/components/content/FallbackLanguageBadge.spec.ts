import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import FallbackLanguageBadge from "./FallbackLanguageBadge.vue";
import { appSyncedLanguageIdsAsRef, cmsLanguages } from "@/globalConfig";
import { mockLanguageDtoEng, mockLanguageDtoFra } from "@/tests/mockdata";

const BADGE = '[data-test="fallback-language-badge"]';

describe("FallbackLanguageBadge", () => {
    beforeEach(() => {
        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra];
        appSyncedLanguageIdsAsRef.value = [mockLanguageDtoFra._id]; // the user synced French
    });

    const mountBadge = (content: unknown) =>
        mount(FallbackLanguageBadge, { props: { content } as never });

    it("renders a badge (the language code) when content is in a non-synced language", () => {
        const w = mountBadge({ language: mockLanguageDtoEng._id });
        const badge = w.find(BADGE);
        expect(badge.exists()).toBe(true);
        expect(badge.text()).toBe(mockLanguageDtoEng.languageCode || mockLanguageDtoEng.name);
    });

    it("renders nothing when content is in a chosen language", () => {
        const w = mountBadge({ language: mockLanguageDtoFra._id });
        expect(w.find(BADGE).exists()).toBe(false);
    });

    it("renders nothing when the language document has not loaded yet", () => {
        cmsLanguages.value = [];
        const w = mountBadge({ language: mockLanguageDtoEng._id });
        expect(w.find(BADGE).exists()).toBe(false);
    });

    it("renders nothing for missing / empty content", () => {
        expect(mountBadge(null).find(BADGE).exists()).toBe(false);
        expect(mountBadge({ language: "" }).find(BADGE).exists()).toBe(false);
    });
});
