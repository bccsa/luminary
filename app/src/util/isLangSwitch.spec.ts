import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, type Ref } from "vue";
import { db, type ContentDto, type Uuid } from "luminary-shared";
import {
    handleLanguageChange,
    markLanguageSwitch,
    consumeLanguageSwitchFlag,
    isLanguageSwitchRef,
} from "./isLangSwitch";
import { appLanguageAsRef, appLanguageIdsAsRef, cmsLanguages, initLanguage } from "@/globalConfig";
import {
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockSwahiliContentDto,
} from "@/tests/mockdata";

vi.mock("@/globalConfig", () => {
    return {
        appLanguageAsRef: ref(null),
        appLanguageIdsAsRef: ref([] as Uuid[]),
        cmsLanguages: ref([]),
        initLanguage: vi.fn(() => Promise.resolve()),
    };
});

describe("isLangSwitch", () => {
    beforeEach(async () => {
        // Reset mocks and refs before each test
        vi.clearAllMocks();
        await db.docs.bulkPut([
            { ...mockLanguageDtoEng },
            { ...mockLanguageDtoFra },
            { ...mockLanguageDtoSwa },
        ]);
        await db.docs.bulkPut([
            { ...mockEnglishContentDto },
            { ...mockFrenchContentDto },
            { ...mockSwahiliContentDto },
        ]);

        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa];
        appLanguageIdsAsRef.value = ["lang-eng", "lang-fra"];

        await initLanguage();
    });

    afterEach(async () => {
        await db.docs.clear();
        // Clean up localStorage if needed
        localStorage.removeItem("isLanguageSwitch");
    });

    describe("markLanguageSwitch", () => {
        it("should set isLanguageSwitchRef to true", () => {
            markLanguageSwitch();
            expect(isLanguageSwitchRef.value).toBe(true);
        });
    });

    describe("consumeLanguageSwitchFlag", () => {
        it("should return the current value and reset to false", () => {
            isLanguageSwitchRef.value = true;
            const result = consumeLanguageSwitchFlag();
            expect(result).toBe(true);
            expect(isLanguageSwitchRef.value).toBe(false);
        });

        it("should return false if already false", () => {
            const result = consumeLanguageSwitchFlag();
            expect(result).toBe(false);
        });
    });

    describe("handleLanguageChange", () => {
        const mockContent: Ref<ContentDto> = ref({
            _id: "content1",
            slug: "slug1",
            language: "lang-eng",
            type: "Content" as any,
            updatedTimeUtc: 0,
            memberOf: [],
            parentId: "",
            status: "Published" as any,
            title: "Title",
            publishDate: 0,
            parentTags: [],
        });

        const availableTranslations: ContentDto[] = [
            { ...mockContent.value, language: "lang-eng", slug: "slug1" },
            { ...mockContent.value, _id: "content2", language: "lang-fra", slug: "slug2" },
        ];

        it("should mark language switch", () => {
            handleLanguageChange({ languageId: "eng" });
            expect(isLanguageSwitchRef.value).toBe(true);
        });

        it("should warn if non-main selector without previousLanguage", () => {
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            handleLanguageChange({ mainSelector: false, languageId: "lang-eng" });
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "Non-main selector requires previousLanguage",
            );
            consoleWarnSpy.mockRestore();
        });

        it("should warn if languageId is missing", () => {
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            handleLanguageChange({ mainSelector: true });
            expect(consoleWarnSpy).toHaveBeenCalledWith("Missing Argument: languageId");
            consoleWarnSpy.mockRestore();
        });

        it("should update content if availableTranslations and content are provided and slug differs", () => {
            handleLanguageChange({
                languageId: "lang-fra",
                availableTranslations,
                content: mockContent,
                previousLanguage: "lang-eng",
            });
            expect(mockContent.value.slug).toBe("slug2");
        });

        it("should not update content if slug is the same", () => {
            handleLanguageChange({
                languageId: "lang-eng",
                availableTranslations,
                content: mockContent,
                previousLanguage: "lang-fra",
            });
            expect(mockContent.value.slug).toBe("slug1");
        });

        it("should add language to appLanguageIdsAsRef if options.add is true and not already included", () => {
            handleLanguageChange({
                languageId: "lang-swa",
                options: { add: true },
                previousLanguage: "lang-eng",
            });
            expect(appLanguageIdsAsRef.value).toContain("lang-swa");
        });

        it("should not add language if already in appLanguageIdsAsRef", () => {
            handleLanguageChange({
                languageId: "lang-eng",
                options: { add: true },
                previousLanguage: "lang-fra",
            });
            expect(appLanguageIdsAsRef.value.filter((id) => id === "lang-eng")).toHaveLength(1);
        });

        it("should increase priority of language in appLanguageIdsAsRef", () => {
            handleLanguageChange({
                languageId: "lang-fra",
                options: { increasePriority: true },
                previousLanguage: "lang-eng",
            });
            expect(appLanguageIdsAsRef.value).toEqual(["lang-fra", "lang-eng"]);
        });

        it("should not increase priority if already at the top", () => {
            handleLanguageChange({
                languageId: "lang-eng",
                options: { increasePriority: true },
                previousLanguage: "lang-fra",
            });
            expect(appLanguageIdsAsRef.value).toEqual(["lang-eng", "lang-fra"]);
        });

        it("should decrease priority of language in appLanguageIdsAsRef", () => {
            handleLanguageChange({
                languageId: "lang-eng",
                options: { decreasePriority: true },
                previousLanguage: "lang-fra",
            });
            expect(appLanguageIdsAsRef.value).toEqual(["lang-fra", "lang-eng"]);
        });

        it("should not decrease priority if already at the bottom", () => {
            handleLanguageChange({
                languageId: "lang-fra",
                options: { decreasePriority: true },
                previousLanguage: "lang-eng",
            });
            expect(appLanguageIdsAsRef.value).toEqual(["lang-eng", "lang-fra"]);
        });

        it("should update appLanguageAsRef if mainSelector is true", () => {
            handleLanguageChange({
                mainSelector: true,
                languageId: "lang-eng",
            });
            expect(appLanguageAsRef.value).toEqual(mockLanguageDtoEng);
        });

        it("should not update appLanguageAsRef if mainSelector is false", () => {
            handleLanguageChange({
                mainSelector: false,
                languageId: "lang-eng",
                previousLanguage: "lang-fra",
            });
            expect(appLanguageAsRef.value).toEqual(mockLanguageDtoEng);
        });

        it("should handle multiple options correctly", () => {
            appLanguageIdsAsRef.value = ["lang-eng", "lang-fra", "lang-swa"];
            handleLanguageChange({
                languageId: "lang-fra",
                options: { increasePriority: true, decreasePriority: false },
                previousLanguage: "lang-eng",
            });
            expect(appLanguageIdsAsRef.value).toEqual(["lang-fra", "lang-eng", "lang-swa"]);
        });
    });
});
