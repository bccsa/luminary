import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import {
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockSwahiliContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "@/tests/mockdata";
import { db, type ContentDto } from "luminary-shared";
import { appLanguageIdsAsRef, cmsLanguages, appDisplayLanguageIdsAsRef } from "@/globalConfig";
import HomePageNewest from "../HomePageNewest.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { HomePageNewest },
        template: "<Suspense><HomePageNewest /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

// Three translations of one parent, each listing the others so the language-priority
// clause is realistic. Distinct titles so the assertion can tell them apart.
const sharedTranslations = ["lang-eng", "lang-fra", "lang-swa"];
const engDoc: ContentDto = {
    ...mockEnglishContentDto,
    title: "Guard Eng",
    availableTranslations: sharedTranslations,
};
const fraDoc: ContentDto = {
    ...mockFrenchContentDto,
    title: "Guard Fra",
    availableTranslations: sharedTranslations,
};
const swaDoc: ContentDto = {
    ...mockSwahiliContentDto,
    title: "Guard Swa",
    availableTranslations: sharedTranslations,
};
const titles = [engDoc.title, fraDoc.title, swaDoc.title] as string[];

// Wait until the feed has settled: the rendered title set stops changing across two
// consecutive polls (so a still-firing query isn't mistaken for "settled empty"), or a
// hard timeout is hit. Returning the final set lets the assertion distinguish a genuine
// empty result (the guarded, provably-empty case) from "still loading".
async function settledShown(wrapper: ReturnType<typeof mount>): Promise<string[]> {
    let prev = "";
    for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 25));
        const text = wrapper.text();
        const shown = titles.filter((t) => text.includes(t));
        const key = shown.join("|");
        if (key === prev && i > 2) return shown;
        prev = key;
    }
    return titles.filter((t) => wrapper.text().includes(t));
}

describe("HomePageNewest — empty display-language guard", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        localStorage.clear();
        await db.docs.bulkPut([
            mockLanguageDtoEng,
            mockLanguageDtoFra,
            mockLanguageDtoSwa,
            engDoc,
            fraDoc,
            swaDoc,
        ]);

        // Force the empty-display-language state: no preferred language AND no CMS
        // default resolved. `appDisplayLanguageIdsAsRef` is empty only when both are
        // absent. Without the guard the priority clause collapses to match-any and the
        // feed renders all three translations of the one parent as separate tiles.
        appLanguageIdsAsRef.value = [];
        cmsLanguages.value = [];

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("does not render every translation of a parent when no display language is resolved", async () => {
        const wrapper = mountWithSuspense();
        const shown = await settledShown(wrapper);
        // Sanity: the empty state really is empty (or the test isn't exercising the footgun).
        expect(appDisplayLanguageIdsAsRef.value).toEqual([]);
        // The feed must never surface sibling translations alongside each other. With the
        // guard the query is provably empty (renders nothing until a display language
        // resolves); without it all three titles appear.
        expect(shown.length).toBeLessThanOrEqual(1);
    });

    it("still shows the preferred translation once a display language resolves", async () => {
        // Same empty start, then a language resolves — the feed must recover and show
        // exactly the one preferred translation, not stay empty nor show all of them.
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        const wrapper = mountWithSuspense();
        const shown = await settledShown(wrapper);

        expect(shown).toContain(engDoc.title);
        expect(shown).not.toContain(fraDoc.title);
        expect(shown).not.toContain(swaDoc.title);
    });
});
