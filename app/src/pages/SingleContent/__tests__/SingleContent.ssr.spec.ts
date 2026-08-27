import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, defineComponent, h, ref, computed } from "vue";
import { renderToString } from "@vue/server-renderer";
import { DocType, PublishStatus, TagType, type ContentDto } from "luminary-shared";
import { SSG_DISPLAY_LANGUAGES } from "@/ssg/renderLanguage";
import { takeRenderIssues } from "@/ssg/renderDiagnostics";
import { releaseSsrChain } from "@/ssg/ssrChains";

// Activate the prerender branch in useContentQuery so queries resolve from the corpus
// instead of the network, exactly as the real vite-ssg Node pass does.
vi.mock("@/ssg/isPrerender", () => ({ isPrerender: () => true }));

// The translations query uses publishedFilter:false, so it always POSTs via queryRemote
// rather than reading the corpus. Stub it to return [] (no sibling translations) and
// stub writeResponseCache so the cache-seed side effect is a no-op.
// vi.hoisted runs before hoisted vi.mock factories execute, so these bindings are
// initialised in time for the luminary-shared factory below to close over them.
const { queryRemoteMock, writeResponseCacheMock } = vi.hoisted(() => ({
    queryRemoteMock: vi.fn().mockResolvedValue([]),
    writeResponseCacheMock: vi.fn(),
}));
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return {
        ...actual,
        queryRemote: (...args: unknown[]) => queryRemoteMock(...args),
        writeResponseCache: (...args: unknown[]) => writeResponseCacheMock(...args),
    };
});

vi.mock("@/auth", () => ({ hasPersistedSession: () => false }));

vi.mock("vue-router", () => ({
    useRoute: () => ({ path: "/article-slug" }),
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
    cmsLanguages: ref([]),
    queryParams: { get: vi.fn() },
    addToMediaQueue: vi.fn(),
    cmsUrl: ref(""),
    userPreferencesAsRef: ref({ bookmarks: [] }),
    appLanguageIdsAsRef: ref(["lang-eng"]),
    appLanguageAsRef: ref(undefined),
    initLanguage: vi.fn(),
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
        readingProgressPercent: ref(0),
        scrollProgressPercent: ref(0),
        restoreScrollPosition: vi.fn(),
    }),
    resolveArticleScrollContainer: () => (typeof window !== "undefined" ? window : {}),
}));

vi.mock("@/util/renderState", () => ({ markPageReady: vi.fn() }));

vi.mock("@/stores/notification", () => ({
    useNotificationStore: () => ({
        addNotification: vi.fn(),
        removeNotification: vi.fn(),
    }),
    resolveNotificationText: vi.fn(),
}));

vi.mock("@/router", () => ({
    isExternalNavigation: () => false,
    markInternalNavigation: vi.fn(),
}));

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({ bucketBaseUrl: computed(() => "") }),
}));

vi.mock("video.js", () => ({ default: vi.fn() }));

// Stub every presentational child that is not part of the query chain under test.
// RelatedContent and ReadMore stay real — their queries and rendered output are the
// things this spec asserts against.
// Function declarations (not arrow consts) so they are fully hoisted and available
// to the vi.mock factories below, which run before the module body's top-level
// const initialisers execute.
function passthrough(name: string) {
    return defineComponent({
        name,
        inheritAttrs: false,
        setup:
            (_, { slots }) =>
            () =>
                h("div", slots.default?.()),
    });
}

function voidStub(name: string) {
    return defineComponent({
        name,
        inheritAttrs: false,
        setup: () => () => h("div"),
    });
}

vi.mock("@/components/BasePage.vue", () => ({
    default: defineComponent({
        name: "BasePage",
        inheritAttrs: false,
        setup:
            (_, { slots }) =>
            () =>
                h("div", [slots.quickControls?.(), slots.default?.()]),
    }),
}));
vi.mock("@/components/IgnorePagePadding.vue", () => ({
    default: passthrough("IgnorePagePadding"),
}));
vi.mock("@/components/common/LHighlightable.vue", () => ({
    default: passthrough("LHighlightable"),
}));
vi.mock("@/components/common/DropdownMenu.vue", () => ({ default: passthrough("DropdownMenu") }));
vi.mock("@/components/images/LImage.vue", () => ({ default: voidStub("LImage") }));
vi.mock("@/components/images/ImageModal.vue", () => ({ default: voidStub("ImageModal") }));
vi.mock("@/components/images/LImageProvider.vue", () => ({
    activeImageCollection: () => 0,
}));
vi.mock("@/components/content/VideoPlayer.vue", () => ({ default: voidStub("VideoPlayer") }));
vi.mock("@/components/content/CopyrightBanner.vue", () => ({
    default: voidStub("CopyrightBanner"),
}));
vi.mock("@/components/content/FallbackLanguageBadge.vue", () => ({
    default: voidStub("FallbackLanguageBadge"),
}));
vi.mock("@/components/form/LModal.vue", () => ({ default: passthrough("LModal") }));
vi.mock("@/components/tags/VerticalTagViewer.vue", () => ({
    default: voidStub("VerticalTagViewer"),
}));
vi.mock("@/components/LoadingBar.vue", () => ({ default: voidStub("LoadingBar") }));
vi.mock("@/pages/NotFoundPage.vue", () => ({ default: voidStub("NotFoundPage") }));

import SingleContent from "../SingleContent.vue";

const CORPUS_KEY = "__SSG_CONTENT_CORPUS__";
const ISSUES_KEY = "__SSG_RENDER_ISSUES__";
const ROUTE_PATH = "/article-slug";

// Hand-built corpus of ContentDto-shaped docs. All published, lang-eng, past
// publishDate, no expiry — the shape the corpus resolver and mangoIsPublished
// require. The four docs exercise the full five-query chain:
//   content (by slug) → tags → RelatedContent.contentDocs → ReadMore.tagDocs
//   (translations is publishedFilter:false, so it POSTs via the queryRemote mock).
const article: ContentDto = {
    _id: "content-article-eng",
    type: DocType.Content,
    parentId: "post-article",
    parentType: DocType.Post,
    updatedTimeUtc: 1000,
    memberOf: [],
    parentTags: ["tag-cat1", "tag-topic1"],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "article-slug",
    title: "The Article",
    text: "<p>Article body</p>",
    publishDate: 1_000_000,
    parentPublishDateVisible: true,
} as unknown as ContentDto;

const categoryTag: ContentDto = {
    _id: "content-tag-cat1-eng",
    type: DocType.Content,
    parentId: "tag-cat1",
    parentType: DocType.Tag,
    parentTagType: TagType.Category,
    updatedTimeUtc: 1000,
    memberOf: [],
    parentTags: [],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "category-slug",
    title: "Category Chip Title",
    publishDate: 1_000_000,
    parentPublishDateVisible: true,
} as unknown as ContentDto;

const topicTag: ContentDto = {
    _id: "content-tag-topic1-eng",
    type: DocType.Content,
    parentId: "tag-topic1",
    parentType: DocType.Tag,
    parentTagType: TagType.Topic,
    updatedTimeUtc: 1000,
    memberOf: [],
    parentTags: [],
    parentTaggedDocs: ["post-other"],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "topic-slug",
    title: "Topic Title",
    publishDate: 1_000_000,
    parentPublishDateVisible: true,
} as unknown as ContentDto;

const otherPost: ContentDto = {
    _id: "content-other-eng",
    type: DocType.Content,
    parentId: "post-other",
    parentType: DocType.Post,
    updatedTimeUtc: 1000,
    memberOf: [],
    parentTags: ["tag-cat1"],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "other-post-slug",
    title: "Other Post Title",
    text: "<p>Other body</p>",
    publishDate: 1_000_000,
    parentPublishDateVisible: true,
} as unknown as ContentDto;

const corpus = [article, categoryTag, topicTag, otherPost];

async function renderWith(displayLanguages: string[]): Promise<string> {
    const app = createApp({ render: () => h(SingleContent, { slug: "article-slug" }) });
    app.provide(SSG_DISPLAY_LANGUAGES, displayLanguages);
    return renderToString(app);
}

describe("SingleContent — server-render (prerender) regression", () => {
    beforeEach(() => {
        (globalThis as Record<string, unknown>)[CORPUS_KEY] = corpus;
        queryRemoteMock.mockReset().mockResolvedValue([]);
        writeResponseCacheMock.mockReset();
        (import.meta.env as { SSR: boolean }).SSR = true;
        (import.meta.env as { VITE_BUILD_TARGET?: string }).VITE_BUILD_TARGET = "web";
    });

    afterEach(() => {
        delete (globalThis as Record<string, unknown>)[CORPUS_KEY];
        delete (globalThis as Record<string, unknown>)[ISSUES_KEY];
        // The per-route chain is a module-level Map; release this route's entry so a
        // stale resolved promise can't interfere with a later test's chain ordering.
        releaseSsrChain(ROUTE_PATH);
        (import.meta.env as { SSR: boolean }).SSR = false;
        (import.meta.env as { VITE_BUILD_TARGET?: string }).VITE_BUILD_TARGET = undefined;
    });

    it("renders chips, the Read more heading, and a related card when the full chain resolves", async () => {
        const html = await renderWith(["lang-eng"]);

        // Category chips gate: v-if="categoryTags.length" — the category tag's
        // title appears only if the tags query resolved from the corpus.
        expect(html).toContain("Category Chip Title");

        // RelatedContent gate: v-if="content && tags.length" — the heading appears
        // only if tags resolved (so the section renders) AND contentDocs resolved
        // (so readMoreItems is non-empty).
        expect(html).toContain("content.read_more");

        // The related card link — proves RelatedContent.contentDocs resolved the
        // second post via the topic tag's parentTaggedDocs, and ReadMore rendered
        // a RouterLink to its slug.
        expect(html).toContain('href="/other-post-slug"');
        expect(html).toContain("Other Post Title");
    });

    it("reports a provably-empty render issue when no display language is provided", async () => {
        // Activate the render-diagnostics capture buffer the way renderDiagnostics
        // expects: a plain array on globalThis that reportRenderIssue pushes into.
        (globalThis as Record<string, unknown>)[ISSUES_KEY] = [];

        await renderWith([]);

        const issues = takeRenderIssues();
        // With no display language, every languageFilter:true query collapses to
        // { language: { $in: [] } } — provably empty. The tags query is the first
        // such chained query, so at least one provably-empty issue is reported
        // instead of the section silently disappearing.
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some((i) => i.kind === "provably-empty")).toBe(true);
    });
});
