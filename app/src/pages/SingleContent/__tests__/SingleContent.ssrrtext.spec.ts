import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref, computed } from "vue";
import type { ContentDto } from "luminary-shared";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { captureSsrArticleTextSnapshot } from "@/util/ssrTextRecovery";
import SingleContent from "../SingleContent.vue";

// Client boot of the web build: isPrerender false, VITE_BUILD_TARGET "web" so the
// component's `isSSG` is true (matching the hydrated client, not the Node prerender).
vi.mock("@/ssg/isPrerender", () => ({ isPrerender: () => false }));

// Hoisted holder so the test body can stage the text-stripped `:anon` cache seed
// the hydrated client starts from. The ref itself is created inside the mock
// factory (which can async-import vue) — vi.hoisted runs before the module's own
// `vue` import is initialized, so it cannot close over that binding directly.
const { seed } = vi.hoisted(() => ({ seed: { ref: undefined as unknown as import("vue").Ref<ContentDto[]> } }));
vi.mock("@/composables/useContentQuery", async () => {
    const { ref, computed } = await import("vue");
    seed.ref = ref<ContentDto[]>([]);
    return {
        // The per-slug content query: seeded synchronously with the text-stripped doc.
        useContentQueryWithState: () => ({ output: seed.ref, isFetching: computed(() => false) }),
        // Translations / tags queries — empty is fine, they don't affect the body.
        useContentQuery: () => ref<ContentDto[]>([]),
    };
});

// Keep luminary-shared's live bindings intact (Proxy, not spread) but neuter the
// paths that would touch Dexie or the network without an initialized data layer.
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return new Proxy(actual, {
        get(target, prop, receiver) {
            if (prop === "queryLocal") return async () => [];
            if (prop === "queryRemote") return async () => [];
            if (prop === "touchRetention") return () => {};
            return Reflect.get(target, prop, receiver);
        },
    });
});

vi.mock("@/auth", () => ({ hasPersistedSession: () => false }));

vi.mock("vue-router", () => ({
    useRoute: () => ({ path: `/${mockEnglishContentDto.slug}` }),
    useRouter: () => ({
        replace: vi.fn(),
        getRoutes: () => [],
        resolve: vi.fn().mockReturnValue({ href: "/resolved" }),
    }),
    RouterLink: defineComponent({
        props: ["to"],
        setup(props, { slots }) {
            return () => {
                const slug = (props.to as { params?: { slug?: string } })?.params?.slug ?? "";
                return h("a", { href: `/${slug}` }, slots.default?.());
            };
        },
    }),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/globalConfig", () => ({
    appName: "TestApp",
    appLanguagePreferredIdAsRef: ref("lang-eng"),
    isDarkTheme: ref(false),
    theme: ref("light"),
    cmsLanguages: ref([mockLanguageDtoEng]),
    cmsDefaultLanguage: computed(() => mockLanguageDtoEng),
    queryParams: { get: vi.fn() },
    addToMediaQueue: vi.fn(),
    cmsUrl: ref(""),
    userPreferencesAsRef: ref({ bookmarks: [] }),
    appLanguageIdsAsRef: ref(["lang-eng"]),
    appLanguageAsRef: ref(undefined),
    initLanguage: vi.fn(),
    userDataSaverEnabled: ref(false),
    isDataSaverEnabled: () => false,
}));

vi.mock("@/seo/contentHead", () => ({ useContentHead: () => {} }));
vi.mock("@/composables/useTranslationSwitcher", () => ({
    useTranslationSwitcher: () => ({
        selectedLanguageId: ref("lang-eng"),
        selectedLanguageCode: ref("eng"),
    }),
}));
vi.mock("@/composables/useReadingProgressTracker", () => ({
    useReadingProgressTracker: () => ({
        hasResumableProgress: ref(false),
        savedProgressPercent: ref(0),
        restoreScrollPosition: vi.fn(),
    }),
    resolveArticleScrollContainer: () => (typeof window !== "undefined" ? window : {}),
}));
vi.mock("@/util/renderState", () => ({ markPageReady: vi.fn() }));
vi.mock("@/stores/notification", () => ({
    useNotificationStore: () => ({ addNotification: vi.fn(), removeNotification: vi.fn() }),
    resolveNotificationText: vi.fn(),
}));
vi.mock("@/router", () => ({
    isExternalNavigation: () => false,
    markInternalNavigation: vi.fn(),
}));

vi.mock("video.js", () => ({ default: vi.fn() }));

function passthrough(name: string) {
    return defineComponent({ name, inheritAttrs: false, setup: (_, { slots }) => () => h("div", slots.default?.()) });
}
function voidStub(name: string) {
    return defineComponent({ name, inheritAttrs: false, setup: () => () => h("div") });
}

vi.mock("@/components/BasePage.vue", () => ({
    default: defineComponent({
        name: "BasePage",
        inheritAttrs: false,
        setup: (_, { slots }) => () => h("div", [slots.quickControls?.(), slots.default?.()]),
    }),
}));
vi.mock("@/components/IgnorePagePadding.vue", () => ({ default: passthrough("IgnorePagePadding") }));
vi.mock("@/components/common/LHighlightable.vue", () => ({ default: passthrough("LHighlightable") }));
vi.mock("@/components/common/DropdownMenu.vue", () => ({ default: passthrough("DropdownMenu") }));
vi.mock("@/components/images/LImage.vue", () => ({ default: voidStub("LImage") }));
vi.mock("@/components/images/ImageModal.vue", () => ({ default: voidStub("ImageModal") }));
vi.mock("@/components/images/LImageProvider.vue", () => ({ activeImageCollection: () => 0 }));
vi.mock("@/components/content/VideoPlayer.vue", () => ({ default: voidStub("VideoPlayer") }));
vi.mock("@/components/content/CopyrightBanner.vue", () => ({ default: voidStub("CopyrightBanner") }));
vi.mock("@/components/content/FallbackLanguageBadge.vue", () => ({ default: voidStub("FallbackLanguageBadge") }));
vi.mock("@/components/content/ContinueReadingPrompt.vue", () => ({ default: voidStub("ContinueReadingPrompt") }));
vi.mock("@/components/content/RelatedContent.vue", () => ({ default: voidStub("RelatedContent") }));
vi.mock("@/components/form/LModal.vue", () => ({ default: passthrough("LModal") }));
vi.mock("@/components/tags/VerticalTagViewer.vue", () => ({ default: voidStub("VerticalTagViewer") }));
vi.mock("@/components/LoadingBar.vue", () => ({ default: voidStub("LoadingBar") }));
vi.mock("@/pages/NotFoundPage.vue", () => ({ default: voidStub("NotFoundPage") }));

const SNAPSHOT_KEY = "__SSG_ARTICLE_TEXT__";

// The text-stripped `:anon` seed: what the prerendered cache write left for the
// hydrated client (ssrCacheStripFields dropped `text`).
function textStrippedSeed(): ContentDto {
    const doc = { ...mockEnglishContentDto } as Record<string, unknown>;
    delete doc.text;
    return doc as ContentDto;
}

describe("SingleContent — client-boot article text recovery", () => {
    beforeEach(() => {
        seed.ref.value = [textStrippedSeed()];
        document.body.innerHTML = "";
        delete (globalThis as Record<string, unknown>)[SNAPSHOT_KEY];
        (import.meta.env as { SSR: boolean }).SSR = false;
        (import.meta.env as { VITE_BUILD_TARGET?: string }).VITE_BUILD_TARGET = "web";
    });

    afterEach(() => {
        document.body.innerHTML = "";
        delete (globalThis as Record<string, unknown>)[SNAPSHOT_KEY];
        (import.meta.env as { SSR: boolean }).SSR = false;
        (import.meta.env as { VITE_BUILD_TARGET?: string }).VITE_BUILD_TARGET = undefined;
    });

    it("recovers the article body from the prerendered snapshot over a text-stripped seed", () => {
        // Stand in for the prerendered prose node main.web.ts snapshots before mount.
        document.body.innerHTML = `<div data-ssr-article-text="true"><p>Article body text</p></div>`;
        captureSsrArticleTextSnapshot();

        const wrapper = mount(SingleContent, { props: { slug: mockEnglishContentDto.slug } });

        const prose = wrapper.find(".prose");
        expect(prose.exists()).toBe(true);
        expect(prose.html()).toContain("<p>Article body text</p>");
        expect(wrapper.text()).toContain("Article body text");
    });

    it("renders no prose when no snapshot was captured (negative control)", () => {
        // No [data-ssr-article-text] node → capture stores null → nothing to recover.
        captureSsrArticleTextSnapshot();

        const wrapper = mount(SingleContent, { props: { slug: mockEnglishContentDto.slug } });

        expect(wrapper.find(".prose").exists()).toBe(false);
        expect(wrapper.text()).not.toContain("Article body text");
    });
});