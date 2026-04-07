import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

const mockAppLanguageAsRef = ref<any>(null);
const mockCmsDefaultLanguage = ref<any>(null);
const mockAppName = "TestApp";

const mockCurrentRoute = ref({
    name: "home",
    meta: { title: "Home" },
});

const mockAfterEachCallbacks: Function[] = [];
const mockBeforeEachCallbacks: Function[] = [];

vi.mock("./globalConfig", () => ({
    appLanguageAsRef: mockAppLanguageAsRef,
    cmsDefaultLanguage: mockCmsDefaultLanguage,
    appName: mockAppName,
}));

vi.mock("./router", () => ({
    default: {
        currentRoute: mockCurrentRoute,
        afterEach: (cb: Function) => {
            mockAfterEachCallbacks.push(cb);
        },
        beforeEach: (cb: Function) => {
            mockBeforeEachCallbacks.push(cb);
        },
    },
}));

describe("i18n", () => {
    beforeEach(() => {
        mockAppLanguageAsRef.value = null;
        mockCmsDefaultLanguage.value = null;
        mockAfterEachCallbacks.length = 0;
        mockBeforeEachCallbacks.length = 0;
    });

    describe("initI18n", () => {
        it("resolves with an i18n instance when app language is set", async () => {
            const { initI18n } = await import("./i18n");

            const promise = initI18n();

            mockAppLanguageAsRef.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: { hello: "Hello", welcome: "Welcome" },
            };
            mockCmsDefaultLanguage.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: { hello: "Hello", welcome: "Welcome" },
            };

            const i18n = await promise;

            expect(i18n).toBeDefined();
            expect((i18n.global.locale as any).value).toBe("en");
        });

        it("merges fallback translations from the default language", async () => {
            vi.resetModules();

            // Re-mock after resetModules
            vi.doMock("./globalConfig", () => ({
                appLanguageAsRef: mockAppLanguageAsRef,
                cmsDefaultLanguage: mockCmsDefaultLanguage,
                appName: mockAppName,
            }));

            vi.doMock("./router", () => ({
                default: {
                    currentRoute: mockCurrentRoute,
                    afterEach: (cb: Function) => mockAfterEachCallbacks.push(cb),
                    beforeEach: (cb: Function) => mockBeforeEachCallbacks.push(cb),
                },
            }));

            const { initI18n } = await import("./i18n");

            const promise = initI18n();

            mockAppLanguageAsRef.value = {
                _id: "lang-fr",
                languageCode: "fr",
                translations: { hello: "Bonjour" },
            };
            mockCmsDefaultLanguage.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: { hello: "Hello", welcome: "Welcome" },
            };

            const i18n = await promise;

            expect((i18n.global.locale as any).value).toBe("fr");
            // The French locale should have "welcome" from the default English language
            const messages = i18n.global.getLocaleMessage("fr") as Record<string, string>;
            expect(messages.hello).toBe("Bonjour");
            expect(messages.welcome).toBe("Welcome");
        });
    });

    describe("initAppTitle", () => {
        it("sets document.title based on route meta", async () => {
            vi.resetModules();

            vi.doMock("./globalConfig", () => ({
                appLanguageAsRef: mockAppLanguageAsRef,
                cmsDefaultLanguage: mockCmsDefaultLanguage,
                appName: mockAppName,
            }));

            vi.doMock("./router", () => ({
                default: {
                    currentRoute: mockCurrentRoute,
                    afterEach: (cb: Function) => mockAfterEachCallbacks.push(cb),
                    beforeEach: (cb: Function) => mockBeforeEachCallbacks.push(cb),
                },
            }));

            const { initI18n, initAppTitle } = await import("./i18n");

            mockCurrentRoute.value = {
                name: "home",
                meta: { title: "Home" },
            };

            const promise = initI18n();

            mockAppLanguageAsRef.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: { Home: "Home" },
            };
            mockCmsDefaultLanguage.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: { Home: "Home" },
            };

            const i18n = await promise;
            initAppTitle(i18n);

            await nextTick();
            await nextTick();

            expect(document.title).toBe("Home - TestApp");
        });

        it("skips title for content routes", async () => {
            vi.resetModules();

            vi.doMock("./globalConfig", () => ({
                appLanguageAsRef: mockAppLanguageAsRef,
                cmsDefaultLanguage: mockCmsDefaultLanguage,
                appName: mockAppName,
            }));

            vi.doMock("./router", () => ({
                default: {
                    currentRoute: mockCurrentRoute,
                    afterEach: (cb: Function) => mockAfterEachCallbacks.push(cb),
                    beforeEach: (cb: Function) => mockBeforeEachCallbacks.push(cb),
                },
            }));

            const { initI18n, initAppTitle } = await import("./i18n");

            mockCurrentRoute.value = {
                name: "content",
                meta: { title: "SomeContent" },
            };

            document.title = "Original Title";

            const promise = initI18n();

            mockAppLanguageAsRef.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: {},
            };
            mockCmsDefaultLanguage.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: {},
            };

            const i18n = await promise;
            initAppTitle(i18n);

            await nextTick();
            await nextTick();

            // Title should not be changed for "content" routes
            expect(document.title).toBe("Original Title");
        });

        it("sets appName as title when route has no meta.title", async () => {
            vi.resetModules();

            vi.doMock("./globalConfig", () => ({
                appLanguageAsRef: mockAppLanguageAsRef,
                cmsDefaultLanguage: mockCmsDefaultLanguage,
                appName: mockAppName,
            }));

            vi.doMock("./router", () => ({
                default: {
                    currentRoute: mockCurrentRoute,
                    afterEach: (cb: Function) => mockAfterEachCallbacks.push(cb),
                    beforeEach: (cb: Function) => mockBeforeEachCallbacks.push(cb),
                },
            }));

            const { initI18n, initAppTitle } = await import("./i18n");

            mockCurrentRoute.value = {
                name: "settings",
                meta: { title: "" },
            } as any;

            const promise = initI18n();

            mockAppLanguageAsRef.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: {},
            };
            mockCmsDefaultLanguage.value = {
                _id: "lang-en",
                languageCode: "en",
                translations: {},
            };

            const i18n = await promise;
            initAppTitle(i18n);

            await nextTick();
            await nextTick();

            expect(document.title).toBe("TestApp");
        });
    });
});
