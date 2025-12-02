import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AclPermission, DocType } from "luminary-shared";
import { nextTick } from "vue";
import waitForExpect from "wait-for-expect";

// Mock luminary-shared with factory function
vi.mock("luminary-shared", async () => {
    const { ref } = await import("vue");
    const actual = await vi.importActual<typeof import("luminary-shared")>("luminary-shared");
    return {
        ...actual,
        accessMap: ref({}),
        isConnected: ref(false),
        getAccessibleGroups: vi.fn(),
        setCancelSync: vi.fn(),
        sync: vi.fn(),
    };
});

// Mock globalConfig with factory function
vi.mock("./globalConfig", async () => {
    const { ref, computed } = await import("vue");
    const actual = await vi.importActual<typeof import("./globalConfig")>("./globalConfig");

    const cmsLanguages = ref([]);
    const cmsLanguageIdsAsRef = computed(() => cmsLanguages.value.map((lang: any) => lang._id));

    return {
        ...actual,
        cmsLanguages,
        cmsLanguageIdsAsRef,
        Sentry: null,
    };
});

// Import after mocks are set up
const { initLanguageSync, initSync, triggerSync, syncIterators } = await import("./sync");

const { accessMap, getAccessibleGroups, isConnected, setCancelSync, sync } = await import(
    "luminary-shared"
);

const { cmsLanguages } = await import("./globalConfig");

describe("sync.ts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        syncIterators.value = { language: 0, content: 0 };
        accessMap.value = {};
        isConnected.value = false;
        cmsLanguages.value = [];
        vi.mocked(sync).mockResolvedValue(undefined);
        // Default getAccessibleGroups to return empty arrays for all DocTypes
        vi.mocked(getAccessibleGroups).mockReturnValue({
            [DocType.Content]: [],
            [DocType.Group]: [],
            [DocType.Language]: [],
            [DocType.Redirect]: [],
            [DocType.Post]: [],
            [DocType.Tag]: [],
            [DocType.User]: [],
            [DocType.DeleteCmd]: [],
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("initLanguageSync", () => {
        it("should initialize language sync watcher", () => {
            initLanguageSync();
            // Watcher runs immediately, so iterator will be 1
            expect(syncIterators.value.language).toBe(1);
        });

        it("should increment language iterator when accessMap changes", async () => {
            initLanguageSync();
            const initialValue = syncIterators.value.language;

            accessMap.value = {
                group1: {
                    [DocType.Post]: { [AclPermission.View]: true },
                },
            };
            await nextTick();

            await waitForExpect(() => {
                expect(syncIterators.value.language).toBe(initialValue + 1);
            });
        });

        it("should increment language iterator when isConnected changes", async () => {
            initLanguageSync();
            const initialValue = syncIterators.value.language;

            isConnected.value = true;
            await nextTick();

            await waitForExpect(() => {
                expect(syncIterators.value.language).toBe(initialValue + 1);
            });
        });

        it("should call setCancelSync(true) when not connected", async () => {
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: ["group1"],
                [DocType.Redirect]: [],
                [DocType.Post]: [],
                [DocType.Tag]: [],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            initLanguageSync();
            isConnected.value = false;
            await nextTick();

            await waitForExpect(() => {
                expect(setCancelSync).toHaveBeenCalledWith(true);
            });
        });

        it("should call setCancelSync(false) when connected", async () => {
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: ["group1"],
                [DocType.Redirect]: [],
                [DocType.Post]: [],
                [DocType.Tag]: [],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            initLanguageSync();
            isConnected.value = true;
            await nextTick();

            await waitForExpect(() => {
                expect(setCancelSync).toHaveBeenCalledWith(false);
            });
        });

        it("should call sync for languages when connected with access", async () => {
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: ["group1"],
                [DocType.Redirect]: [],
                [DocType.Post]: [],
                [DocType.Tag]: [],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            initLanguageSync();
            isConnected.value = true;
            await nextTick();

            await waitForExpect(() => {
                expect(sync).toHaveBeenCalledWith({
                    type: DocType.Language,
                    memberOf: ["group1"],
                    limit: 100,
                    cms: true,
                    includeDeleteCmds: true,
                });
            });
        });

        it("should not call sync for languages when no language access", async () => {
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: [],
                [DocType.Redirect]: [],
                [DocType.Post]: [],
                [DocType.Tag]: [],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            initLanguageSync();
            isConnected.value = true;
            await nextTick();

            expect(sync).not.toHaveBeenCalled();
        });

        it("should handle sync errors gracefully", async () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            const syncError = new Error("Sync failed");
            vi.mocked(sync).mockRejectedValue(syncError);
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: ["group1"],
                [DocType.Redirect]: [],
                [DocType.Post]: [],
                [DocType.Tag]: [],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            initLanguageSync();
            isConnected.value = true;
            await nextTick();

            await waitForExpect(() => {
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    "Error during language sync:",
                    syncError,
                );
            });

            consoleErrorSpy.mockRestore();
        });
    });

    describe("initSync", () => {
        it("should initialize content sync watcher", () => {
            const initialValue = syncIterators.value.content;
            initSync();
            expect(syncIterators.value.content).toBe(initialValue);
        });

        it("should increment content iterator when cmsLanguages changes", async () => {
            initSync();
            const initialValue = syncIterators.value.content;

            cmsLanguages.value = [
                { _id: "lang1", languageCode: "en", name: "English", default: 1 },
            ] as any;
            await nextTick();

            await waitForExpect(() => {
                expect(syncIterators.value.content).toBe(initialValue + 1);
            });
        });

        it("should not sync when not connected", async () => {
            initSync();
            isConnected.value = false;
            syncIterators.value.content++;
            await nextTick();

            expect(sync).not.toHaveBeenCalled();
        });

        it("should sync posts and tags when connected with access", async () => {
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: [],
                [DocType.Redirect]: [],
                [DocType.Post]: ["group1"],
                [DocType.Tag]: ["group2"],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            cmsLanguages.value = [
                { _id: "lang1", languageCode: "en", name: "English", default: 1 },
                { _id: "lang2", languageCode: "fr", name: "French", default: 0 },
            ] as any;

            initSync();
            isConnected.value = true;
            syncIterators.value.content++;
            await nextTick();

            await waitForExpect(() => {
                // Should sync posts
                expect(sync).toHaveBeenCalledWith({
                    type: DocType.Post,
                    memberOf: ["group1"],
                    limit: 1000,
                    cms: true,
                });

                // Should sync tags
                expect(sync).toHaveBeenCalledWith({
                    type: DocType.Tag,
                    memberOf: ["group2"],
                    limit: 1000,
                    cms: true,
                });

                // Should sync post content
                expect(sync).toHaveBeenCalledWith({
                    type: DocType.Content,
                    subType: DocType.Post,
                    memberOf: ["group1"],
                    languages: ["lang1", "lang2"],
                    limit: 100,
                    cms: true,
                    includeDeleteCmds: false,
                });

                // Should sync tag content
                expect(sync).toHaveBeenCalledWith({
                    type: DocType.Content,
                    subType: DocType.Tag,
                    memberOf: ["group2"],
                    languages: ["lang1", "lang2"],
                    limit: 1000,
                    cms: true,
                    includeDeleteCmds: false,
                });
            });
        });

        it("should sync redirects when connected with access", async () => {
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: [],
                [DocType.Redirect]: ["group1"],
                [DocType.Post]: [],
                [DocType.Tag]: [],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            initSync();
            isConnected.value = true;
            syncIterators.value.content++;
            await nextTick();

            await waitForExpect(() => {
                expect(sync).toHaveBeenCalledWith({
                    type: DocType.Redirect,
                    memberOf: ["group1"],
                    limit: 1000,
                    cms: true,
                });
            });
        });

        it("should sync groups when connected with access", async () => {
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: ["group1"],
                [DocType.Language]: [],
                [DocType.Redirect]: [],
                [DocType.Post]: [],
                [DocType.Tag]: [],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            initSync();
            isConnected.value = true;
            syncIterators.value.content++;
            await nextTick();

            await waitForExpect(() => {
                expect(sync).toHaveBeenCalledWith({
                    type: DocType.Group,
                    memberOf: ["group1"],
                    limit: 1000,
                    cms: true,
                });
            });
        });

        it("should handle sync errors gracefully", async () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            const syncError = new Error("Content sync failed");
            vi.mocked(sync).mockRejectedValue(syncError);
            vi.mocked(getAccessibleGroups).mockReturnValue({
                [DocType.Content]: [],
                [DocType.Group]: [],
                [DocType.Language]: [],
                [DocType.Redirect]: [],
                [DocType.Post]: ["group1"],
                [DocType.Tag]: ["group2"],
                [DocType.User]: [],
                [DocType.DeleteCmd]: [],
            });

            cmsLanguages.value = [
                { _id: "lang1", languageCode: "en", name: "English", default: 1 },
            ] as any;

            initSync();
            isConnected.value = true;
            syncIterators.value.content++;
            await nextTick();

            await waitForExpect(() => {
                expect(consoleErrorSpy).toHaveBeenCalled();
                expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
            });

            consoleErrorSpy.mockRestore();
        });
    });

    describe("triggerSync", () => {
        it("should increment both language and content iterators", () => {
            const initialLanguage = syncIterators.value.language;
            const initialContent = syncIterators.value.content;
            triggerSync();
            expect(syncIterators.value.language).toBe(initialLanguage + 1);
            expect(syncIterators.value.content).toBe(initialContent + 1);
        });

        it("should increment both iterators multiple times", () => {
            const initialLanguage = syncIterators.value.language;
            const initialContent = syncIterators.value.content;
            triggerSync();
            triggerSync();
            triggerSync();
            expect(syncIterators.value.language).toBe(initialLanguage + 3);
            expect(syncIterators.value.content).toBe(initialContent + 3);
        });
    });

    describe("iterator interactions", () => {
        it("should increment both language and content iterators together", () => {
            const initialLanguage = syncIterators.value.language;
            const initialContent = syncIterators.value.content;

            triggerSync();
            expect(syncIterators.value.language).toBe(initialLanguage + 1);
            expect(syncIterators.value.content).toBe(initialContent + 1);

            syncIterators.value.content++;
            expect(syncIterators.value.language).toBe(initialLanguage + 1);
            expect(syncIterators.value.content).toBe(initialContent + 2);
        });

        it("should handle both iterators incrementing from state changes", async () => {
            initLanguageSync();
            const initialLanguage = syncIterators.value.language;
            const initialContent = syncIterators.value.content;

            // Set languages so content iterator can increment
            cmsLanguages.value = [
                { _id: "lang1", languageCode: "en", name: "English", default: 1 },
            ] as any;
            await nextTick();

            // Changing accessMap should increment both (language always, content only if languages exist)
            accessMap.value = {
                group1: {
                    [DocType.Post]: { [AclPermission.View]: true },
                },
            };
            await nextTick();

            await waitForExpect(() => {
                expect(syncIterators.value.language).toBeGreaterThan(initialLanguage);
                expect(syncIterators.value.content).toBeGreaterThan(initialContent);
            });
        });
    });
});
