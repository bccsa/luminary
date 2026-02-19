import { vi } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import { db, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import {
    initLanguage,
    cmsLanguages,
    translatableLanguagesAsRef,
    cmsLanguageIdAsRef,
} from "@/globalConfig";

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock URL.createObjectURL for tests
if (typeof window.URL.createObjectURL === "undefined") {
    Object.defineProperty(window.URL, "createObjectURL", { value: () => "blob:mock-url" });
}

// Set up mocks at module level (must be executed before tests run)
vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            logout: vi.fn(),
            loginWithRedirect: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
    };
});

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
            currentRoute: {
                value: {
                    name: "edit",
                    params: {
                        languageCode: "eng",
                    },
                },
            },
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

// @ts-expect-error
window.scrollTo = vi.fn();

export const getDefaultMountOptions = () => ({
    global: {
        mocks: {
            $router: {
                push: vi.fn(),
                replace: vi.fn(),
                back: vi.fn(),
                currentRoute: {
                    value: {
                        name: "edit",
                        params: {
                            languageCode: "eng",
                        },
                    },
                },
            },
        },
    },
});

export const setupTestEnvironment = async () => {
    // Set up the Pinia store before each test
    setActivePinia(createTestingPinia());
    await db.docs.clear();
    await db.localChanges.clear();

    // seed the fake indexDB with mock data
    await db.docs.bulkPut([mockData.mockPostDto]);
    await db.docs.bulkPut([
        mockData.mockEnglishContentDto,
        mockData.mockFrenchContentDto,
        mockData.mockSwahiliContentDto,
    ]);
    await db.docs.bulkPut([
        mockData.mockLanguageDtoEng,
        mockData.mockLanguageDtoFra,
        mockData.mockLanguageDtoSwa,
    ]);

    accessMap.value = { ...mockData.superAdminAccessMap };
    await initLanguage();
};

export const cleanupTestEnvironment = async () => {
    // Clear the database after each test
    await db.docs.clear();
    await db.localChanges.clear();
    vi.clearAllMocks();

    // Reset global config state
    cmsLanguages.value = [];
    translatableLanguagesAsRef.value = [];
    cmsLanguageIdAsRef.value = "";
};

// Re-export commonly used mock data
export {
    mockPostDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockSwahiliContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockLocalChange1,
    superAdminAccessMap,
    translateAccessToAllContentMap,
} from "@/tests/mockdata";
