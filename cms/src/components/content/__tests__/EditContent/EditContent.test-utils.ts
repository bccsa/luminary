import { vi } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import { db, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { initLanguage } from "@/globalConfig";

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock setup functions
export const setupAuth0Mock = () => {
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
};

export const setupRouterMock = () => {
    vi.mock("vue-router", async (importOriginal) => {
        const actual = await importOriginal();
        return {
            // @ts-expect-error
            ...actual,
            useRouter: () => ({
                currentRoute: {
                    value: {
                        params: {
                            languageCode: "eng",
                        },
                    },
                },
            }),
            onBeforeRouteLeave: vi.fn(),
        };
    });
};

export const setupWindowMocks = () => {
    // @ts-expect-error
    window.scrollTo = vi.fn();
};

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
    initLanguage();
};

export const cleanupTestEnvironment = async () => {
    // Clear the database after each test
    await db.docs.clear();
    await db.localChanges.clear();
    vi.clearAllMocks();
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
