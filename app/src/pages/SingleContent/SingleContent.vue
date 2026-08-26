<script setup lang="ts">
import {
    DocType,
    PostType,
    TagType,
    isConnected,
    mangoCompile,
    queryLocal,
    queryRemote,
    touchRetention,
    type ContentDto,
    type RedirectDto,
    type Uuid,
    type LanguageDto,
    verifyAccess,
    AclPermission,
    readingDepthWeight,
} from "luminary-shared";
import { publishedNowConditions } from "@/util/mangoIsPublished";
import { useContentQuery, useContentQueryWithState } from "@/composables/useContentQuery";
import { recordAffinity } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { notifyHighlightsChanged } from "@/recommendation/highlightStore";
import { markSeen } from "@/recommendation/seenStore";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { BookmarkIcon as BookmarkIconSolid, TagIcon, SunIcon } from "@heroicons/vue/24/solid";
import {
    BookmarkIcon as BookmarkIconOutline,
    MoonIcon,
    ClockIcon,
    PencilIcon,
} from "@heroicons/vue/24/outline";

import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import {
    appName,
    appLanguagePreferredIdAsRef,
    isDarkTheme,
    theme,
    cmsLanguages,
    cmsDefaultLanguage,
    queryParams,
    addToMediaQueue,
    cmsUrl,
} from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import RelatedContent from "@/components/content/RelatedContent.vue";
import VerticalTagViewer from "@/components/tags/VerticalTagViewer.vue";

import LImage from "@/components/images/LImage.vue";

import { userPreferencesAsRef } from "@/globalConfig";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import LModal from "@/components/form/LModal.vue";
import CopyrightBanner from "@/components/content/CopyrightBanner.vue";
import FallbackLanguageBadge from "@/components/content/FallbackLanguageBadge.vue";
import { useI18n } from "vue-i18n";
import ImageModal from "@/components/images/ImageModal.vue";
import BasePage from "@/components/BasePage.vue";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import { SpeakerWaveIcon } from "@heroicons/vue/24/solid";
import { markLanguageSwitch } from "@/util/isLangSwitch";
import LoadingBar from "@/components/LoadingBar.vue";
import { activeImageCollection } from "@/components/images/LImageProvider.vue";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import LHighlightable from "@/components/common/LHighlightable.vue";
import DropdownMenu from "@/components/common/DropdownMenu.vue";
import ArticleOutline from "./ArticleOutline.vue";
import { markPageReady } from "@/util/renderState";
import { computeEstimatedReadingMinutes, resolveReadingSpeedWpm } from "@/util/readingTime";
import {
    resolveArticleScrollContainer,
    useReadingProgressTracker,
} from "@/composables/useReadingProgressTracker";
import { useContentHead, type PublicTaxonomy } from "@/seo/contentHead";
import { useTranslationSwitcher } from "@/composables/useTranslationSwitcher";
import { recoverSsrArticleText, takeSsrArticleTextSnapshot } from "@/util/ssrTextRecovery";
import { isPrerender } from "@/ssg/isPrerender";

const router = useRouter();

type Props = {
    slug: string;
};
const props = defineProps<Props>();

// True for the web/SSG build (prerender and hydrated client), false for the normal SPA. Gates the per-slug response-cache ids so the web build matches the prerender's seed on first paint; the normal SPA would only accumulate one localStorage entry per article.
const isSSG = import.meta.env.VITE_BUILD_TARGET === "web";

const { t } = useI18n();
const showCategoryModal = ref(false);
const enableZoom = ref(false);

const currentImageIndex = ref(0);

// Content by slug via the same local-first hybrid query on every build. On the web build the prerender primes this query's response cache (`cacheId = slug` makes the per-document seed safe) so the client shows the article on first paint with no flash; `cacheId` is scoped to isSSG since the normal SPA gets no benefit.
const { output: contentArr, isFetching: isContentFetching } = useContentQueryWithState(
    () => [{ slug: props.slug }],
    {
        includeScheduled: false,
        languageFilter: false,
        cache: true,
        cacheId: isSSG ? props.slug : undefined,
        // Seek the single slug doc via the slug-led index. The publishDate sort is required
        // for CouchDB to engage the index (slug eq alone falls back to a full scan).
        useIndex: "content-slug-publishDate-index",
        sort: [{ publishDate: "desc" }],
        // slug is unique — at most one doc can ever match.
        limit: 1,
        // Strip nothing from the live/persisted copy (unlike overview feeds, which default
        // to stripping fts/ftsTokenCount/text/memberOf/_rev): this is the document actually
        // opened in SingleContent — `text` (rendered below) and `memberOf` (read by canEdit)
        // are needed live, and `fts`/`ftsTokenCount` must persist offline so this doc
        // surfaces in offline FTS search.
        stripFields: [],
        persistOffline: true,
        // `text` is the heaviest field on the page and already sits in the prerendered
        // `[data-ssr-article-text]` node — omit it (and the FTS/rev fields, which the
        // live/persisted copy above now keeps) from the SSR-authored cache write so it
        // isn't shipped twice; the hydration patch below recovers `text` from that node.
        ssrCacheStripFields: ["text", "fts", "ftsTokenCount", "_rev"],
    },
);

// `content` is a computed over the query result plus an override for in-place language switches. A computed stays readable at SSR render time (a watch-based binding would not run there). `contentOverride` is cleared on slug change so a stale override can't shadow the new page.
const contentOverride = ref<ContentDto | undefined>();
// Cold-start backstop: a doc fetched by `resolveNotFound` when the response-cache
// seed is absent (logged-in `:auth` user, quota-hit/cleared localStorage) and Dexie
// is still empty before sync runs — prevents a false 404 flash. Cleared on slug
// change and once the live query emits (local docs carry full `text` via
// `stripFields: []`, so the live doc takes over cleanly).
const coldStartBackstop = ref<ContentDto | undefined>();
const content = computed<ContentDto | undefined>(
    () => contentOverride.value ?? coldStartBackstop.value ?? contentArr.value[0],
);
watch(
    () => props.slug,
    () => {
        contentOverride.value = undefined;
        coldStartBackstop.value = undefined;
    },
);

// One-time hydration patch (client only): recover `text` (omitted from the cache seed via `ssrCacheStripFields`) from the snapshot `main.web.ts` captured before `app.mount` cleared the prerendered DOM, so `v-html` matches the prerendered HTML. Runs in setup (not a watcher) so it lands before the template's first evaluation. Guarded on `!isPrerender` so it runs in the browser after the web build hydrates but skips the Node prerender pass; the normal SPA always passes. No-op when the seed already carries `text` or there's nothing to recover.
if (!isPrerender()) {
    const recovered = recoverSsrArticleText(contentArr.value[0], takeSsrArticleTextSnapshot());
    if (recovered) contentOverride.value = recovered;
}

const liveUrl = () => {
    if (!content.value || !selectedLanguageCode.value) return "";

    const docType = content.value.parentType;
    const subType = content.value.parentPostType || content.value.parentTagType;
    const id = content.value.parentId;
    const lang = selectedLanguageCode.value;
    const baseUrl = cmsUrl.value;
    const url = baseUrl
        ? `${baseUrl}/${docType}/edit/${subType}/${id}/${lang}`
        : "http://localhost";

    return url.toString();
};

const openCmsEditor = () => {
    if (liveUrl()) {
        window.open(liveUrl(), "_blank");
    }
};

const canEdit = () => {
    if (!content.value) return false;
    if (content.value.memberOf.length === 0) return true;
    return verifyAccess(content.value.memberOf, content.value.parentType!, AclPermission.Edit);
};

// Redirect resolution: a redirect takes precedence over content, and the server guarantees a slug carries one or the other, so the local check and the content bind never contend. Server-only redirects are caught by queryRemote in the not-found resolver, so normal pages pay no redirect API call.
function routeRedirect(redirect: RedirectDto): boolean {
    if (!redirect?.toSlug) return false;
    const targetRoute = router.getRoutes().find((r) => r.name === redirect.toSlug);
    if (targetRoute) router.replace({ name: redirect.toSlug });
    else router.replace({ name: "content", params: { slug: redirect.toSlug } });
    return true;
}

// Loading until the content query answers for the current slug. The prerender fetches
// content in onServerPrefetch, so the loading branch is never serialized. The hydrated
// web client only starts non-loading when `contentArr` is already populated — i.e. the
// `:anon` cache seed actually hit — matching what the prerender rendered, so there's no
// loading-state flash. When it hasn't (a logged-in `:auth` client, or cleared/quota-hit
// localStorage), the prerender seeded nothing for this session, so start loading instead:
// otherwise `is404` (below) would read the still-empty `content` as "not found" and flash
// NotFoundPage before the cold-start backstop resolves it.
const isLoading = ref(isSSG && !isPrerender() ? contentArr.value.length === 0 : !isSSG);

// Slug this generation's not-found resolution belongs to — guards against a stale redirect probe resolving after the slug moves on, and against re-running the probe once this slug is already resolved.
let notFoundSlug: string | undefined;

// Wait for the query to genuinely settle (`isContentFetching` false) before treating an empty result as "not found", so a slow query isn't wrongly declared missing. Last chance before 404: a server-only redirect.
const resolveNotFound = async () => {
    if (contentArr.value.length || isContentFetching.value) return;
    const slug = props.slug;
    if (notFoundSlug === slug) return; // already resolved (or resolving) for this slug
    notFoundSlug = slug;
    if (isConnected.value) {
        try {
            const remote = await queryRemote<RedirectDto>({
                selector: { $and: [{ type: DocType.Redirect }, { slug }] },
            });
            if (props.slug !== slug) return; // slug changed mid-await
            if (remote[0] && routeRedirect(remote[0])) return;
        } catch {
            /* fall through to 404 */
        }
    }
    // Cold-start backstop: the prerender seeds `:anon` only, so a logged-in
    // client (reads `:auth`) or cleared/quota-hit localStorage has no seed, and
    // Dexie is empty until sync runs. Before declaring not-found, confirm the
    // slug exists via the same REST path the SSR prerender used — mirrors the
    // composable's query shape for the `languageFilter: false` case (the
    // publishDate sort is required for the slug-led index to engage). If the
    // API confirms absence or is unreachable, fall through to the real 404.
    try {
        const remote = await queryRemote<ContentDto>({
            selector: {
                $and: [
                    { type: DocType.Content },
                    { slug },
                    ...publishedNowConditions({ includeScheduled: false }),
                ],
            },
            use_index: "content-slug-publishDate-index",
            $sort: [{ publishDate: "desc" }],
            $limit: 1,
        });
        if (props.slug !== slug) return; // slug changed mid-await
        if (remote[0]) {
            coldStartBackstop.value = remote[0];
            isLoading.value = false; // found — show the article, not 404
            return;
        }
    } catch {
        /* API unreachable — fall through to 404 (offline + no seed + no local ⇒ nothing to show) */
    }
    // `content` is a computed over the (empty) query result → already
    // undefined; just stop loading so the 404 branch shows.
    if (props.slug === slug && !contentArr.value.length) {
        isLoading.value = false;
    }
};

// Ending id -> tags for a reading session in progress, read by the reading-progress
// tracker's onSessionEnd (registered further below, outside the client-only guard) to
// score affinity by how deep the reader actually got.
const contentTagsById = new Map<Uuid, Uuid[] | undefined>();

// Client-only (web + the normal SPA): redirect / not-found / loading wiring + retention. The Node prerender skips this — `content` is already populated and rendered via onServerPrefetch. Guarded on `isPrerender` (not a `window` check, since vite-ssg's mock makes `window` exist in Node too).
if (!isPrerender()) {
    watch(
        () => props.slug,
        async (slug) => {
            isLoading.value = true;
            // A fresh navigation attempt — even a revisit of a slug that previously
            // resolved to not-found — gets its own not-found resolution.
            notFoundSlug = undefined;
            // Instant local redirect check (synced redirects route immediately).
            const redirect = (
                await queryLocal<RedirectDto>({
                    selector: { $and: [{ type: DocType.Redirect }, { slug }] },
                })
            )[0];
            if (props.slug === slug && redirect) routeRedirect(redirect);
        },
        { immediate: true },
    );

    // `content` follows `contentArr` (a computed); this watch owns only the side
    // effect of stopping the loading state once a doc resolves. The live doc
    // carries full `text` (`stripFields: []`), so once it emits the backstop
    // snapshot is dropped and the live, socket-updated doc takes over.
    watch(
        contentArr,
        (docs) => {
            if (docs.length) {
                coldStartBackstop.value = undefined;
                isLoading.value = false;
            }
        },
        { immediate: true },
    );

    // Resolve "not found" once the content query has genuinely settled and is still empty (see `resolveNotFound`).
    watch([contentArr, isContentFetching], () => void resolveNotFound(), { immediate: true });

    // Keep a viewed article alive in the offline document store: refresh its retention
    // deadline whenever a real content doc is displayed, so a below-cutoff article the
    // user reads isn't evicted as stale. No-op for the placeholder / undefined.
    //
    // Affinity/seen tracking is gated behind a dwell timer: recording on mount would
    // count a mis-tap or an immediately-closed shared link as real interest. Clearing
    // the timer on every content change (incl. unmount) means only a page actually
    // stayed open for DWELL_MS counts.
    const DWELL_MS = 15000;
    let dwellTimer: ReturnType<typeof setTimeout> | undefined;
    watch(content, (c) => {
        clearTimeout(dwellTimer);
        if (c && c._id) {
            touchRetention([c._id]);
            const id = c._id;
            const tags = c.parentTags;
            const hasText = !!c.text;
            contentTagsById.set(id, tags);
            // The tracker's content-change watcher flushes after this content watcher, so
            // keep the ending id available through that callback, then discard any stale
            // entries left by content that never started a reading session.
            nextTick(() => {
                const currentId = content.value?._id;
                for (const knownId of contentTagsById.keys()) {
                    if (knownId !== currentId) contentTagsById.delete(knownId);
                }
            });
            dwellTimer = setTimeout(() => {
                if (!hasText) recordAffinity(tags);
                markSeen(id);
            }, DWELL_MS);
        }
    });
    onUnmounted(() => clearTimeout(dwellTimer));
}

// Available translations and their languages, derived via computeds (render-safe during the prerender, where watchers don't run) so the dropdown and hreflang are correct in the static HTML. Languages come from shared `cmsLanguages`, so no separate Dexie-backed query is needed.
const isLoadingTranslations = ref(false);

const translationsArr = useContentQuery(
    // Before `content` resolves there is no parent to match siblings against. An empty
    // `$in` is provably-empty, so HybridQuery short-circuits both the Dexie read and
    // the API supplement.
    () =>
        content.value?.parentId
            ? [{ parentId: content.value.parentId }]
            : [{ parentId: { $in: [] } }],
    {
        publishedFilter: false,
        cache: true,
        // Per-slug discriminator so the per-document cache is SAFE — a shape-only key
        // would seed this page from a previously-viewed post's translations. Only SSG
        // depends on this cache entry (matching the prerender's seed on first paint);
        // scoped to isSSG so normal SPA use doesn't accumulate one entry per slug
        // ever visited for no benefit.
        cacheId: isSSG ? `translations:${props.slug}` : undefined,
        // These are sibling metadata for the dropdown/hreflang, not the article itself, so don't persist them offline. `cache: true` stays so the SSR-rendered translations list matches the client's first paint.
        persistOffline: false,
        // Seek siblings by parentId rather than scanning the publishDate index.
        useIndex: "content-parentId-publishDate-index",
        sort: [{ publishDate: "desc" }],
        // A language switch binds the chosen translation straight into `content`, so
        // the LIVE result keeps `text` (body) + `memberOf` (read by canEdit).
        stripFields: ["fts", "ftsTokenCount", "_rev"],
        // Drop `text` from the CACHE seed; it's only needed on a language switch, where the live query re-loads it. Serializing every sibling's full text per page would balloon page weight.
        cacheStripFields: ["text"],
    },
);

// Published-right-now check compiled to a plain predicate rather than reusing `mangoIsPublished`, which also bakes in single-language-priority selection — wrong here, where the dropdown/hreflang need every published sibling translation. `includeScheduled: false` excludes future-dated "coming soon" translations that aren't readable yet.
const isPublishedNow = mangoCompile({ $and: publishedNowConditions({ includeScheduled: false }) });

const availableTranslations = computed<ContentDto[]>(() => {
    if (!content.value) return [];
    const published = translationsArr.value.filter((c) => isPublishedNow(c));
    return published.length > 1 ? published : [];
});

const localLanguages = ref<LanguageDto[]>([]);

// cmsLanguages (public Language docs, loaded globally on the web build) already
// covers every language a published translation can reference there, so this Dexie
// supplement is redundant on isSSG — it only matters for a logged-in normal SPA user
// whose translation is in a language doc not present in the public set.
if (!isSSG) {
    watch(
        availableTranslations,
        async (translations) => {
            const ids = [...new Set(translations.map((t) => t.language))];
            if (!ids.length) {
                localLanguages.value = [];
                return;
            }
            localLanguages.value = await queryLocal<LanguageDto>({
                selector: { $and: [{ type: DocType.Language }, { _id: { $in: ids } }] },
            });
        },
        { immediate: true },
    );
}

// Only translations whose Language doc is actually loaded get a dropdown entry — never
// fabricate a languageCode from the language id. `cmsLanguages` (prerender) and the
// `localLanguages` fetch (client) cover every referenced language, so an unloaded one is a
// brief pre-load gap, not a permanent drop.
// All known Language docs by id — `cmsLanguages` (global, prerender-seeded) plus
// `localLanguages` (client supplement for a translation whose Language doc isn't in the
// public set). Used both for the dropdown (below) and for looking up the current article's
// own language doc directly, independent of which translations happen to be published.
const languagesById = computed(
    () => new Map([...cmsLanguages.value, ...localLanguages.value].map((l) => [l._id, l])),
);

const languages = computed<LanguageDto[]>(() =>
    availableTranslations.value
        .map((t) => languagesById.value.get(t.language))
        .filter((l): l is LanguageDto => !!l),
);

// Tags drive the category chips and RelatedContent. In the prerender the seam fetches them chained after `content` (via `ssrChain`, so the selector reads a resolved parent) and primes a per-slug cache for no-flash hydration.
const tags = useContentQuery(
    () => {
        // Before `content` resolves, match nothing via a provably-empty `$in` rather
        // than POSTing `{ parentId: { $in: [""] } }`, which full-scans.
        if (!content.value?.parentId) return [{ parentId: { $in: [] } }];
        // Include this document's parent ID to show content tagged with this
        // document's parent (if a TagDto).
        const parentIds = (content.value.parentTags || []).concat([content.value.parentId]);
        return [{ parentId: { $in: parentIds } }, { parentType: DocType.Tag }];
    },
    {
        includeScheduled: false,
        cache: true,
        // Per-slug discriminator so the per-document cache is safe.
        cacheId: `tags:${props.slug}`,
        // Seek by parentId. Don't sort: a `$in` on this index's leading field plus a
        // publishDate sort is unsatisfiable (CouchDB rejects "No index exists for this
        // sort"), and the chips / related-content lookups read these tags unordered.
        useIndex: "content-parentId-publishDate-index",
    },
);

const categoryTags = computed(() => tags.value.filter((t) => t.parentTagType == TagType.Category));

// SEO head — driven by resolved public content and taxonomy so the prerendered page, canonical metadata, Open Graph image and JSON-LD always agree. Gated behind isSSG since crawlers only see the prerendered static HTML, so the normal SPA has no reason to compute it or invoke `useHead`.
if (isSSG) {
    const hreflangAlternates = computed(() =>
        availableTranslations.value
            .map((t) => {
                const lang = cmsLanguages.value.find((l) => l._id === t.language);
                return lang && t.slug ? { code: lang.languageCode, slug: t.slug } : null;
            })
            .filter((a): a is { code: string; slug: string } => !!a),
    );

    const publicTaxonomy = computed<PublicTaxonomy[]>(() => {
        const expectedIds = new Set(content.value?.parentTags ?? []);
        const seen = new Set<string>();
        return categoryTags.value.flatMap((tag) => {
            // A tag must be one of the article's inherited public taxonomy IDs and
            // have a slug before it can become a stable breadcrumb/JSON-LD entry.
            if (
                !expectedIds.has(tag.parentId) ||
                !tag.title ||
                !tag.slug ||
                seen.has(tag.parentId)
            ) {
                return [];
            }
            seen.add(tag.parentId);
            return [{ name: tag.title, url: `/${tag.slug}` }];
        });
    });

    useContentHead(content, hreflangAlternates, publicTaxonomy);
}

const selectedCategoryId = ref<Uuid | undefined>();

// The content query already filters publish state, so `content` is either a valid
// published doc or absent — 404 is purely "resolved to nothing".
const is404 = computed(() => {
    // A query that has not settled is never "not found": the content query may be
    // mid-flight with an empty window (e.g. the local read landed before the API
    // supplement), so suppress 404 while it is still fetching as well as loading.
    if (isLoading.value || isContentFetching.value) return false;
    return !content.value;
});

// Function to toggle bookmark for the current content
const toggleBookmark = () => {
    if (!userPreferencesAsRef.value.bookmarks) {
        userPreferencesAsRef.value.bookmarks = [];
    }

    if (isBookmarked.value) {
        // Remove from bookmarks
        userPreferencesAsRef.value.bookmarks = userPreferencesAsRef.value.bookmarks.filter(
            (b) => b.id != content.value?.parentId,
        );
        if (content.value) {
            recordAffinity(
                content.value.parentTags,
                affinityConfig.value.eventWeight.bookmarkRemoved,
            );
        }
    } else {
        // Add to bookmarks
        if (!content.value) return;
        userPreferencesAsRef.value.bookmarks.push({ id: content.value.parentId, ts: Date.now() });
        // Bookmarking is explicit, unambiguous intent — weight it above a plain open.
        recordAffinity(content.value.parentTags, affinityConfig.value.eventWeight.bookmark);
        useNotificationStore().addNotification({
            id: "bookmark-added",
            title: t("bookmarks.notification.title"),
            description: t("bookmarks.notification.description"),
            state: "success",
            type: "toast",
            timeout: 5000,
        });
    }
};

// Check if the current content is bookmarked
const isBookmarked = computed(() => {
    return userPreferencesAsRef.value.bookmarks?.some((b) => b.id == content.value?.parentId);
});

// The normal SPA sets the tab/window title imperatively (it has no @unhead plugin). The web
// build's `useContentHead` above owns the whole head there, including the meta
// description — serialized into the prerendered HTML that crawlers actually read.
// The normal SPA has no such crawler ever inspecting its live DOM, so it has no equivalent
// meta-description responsibility; only the title (visible in an installed PWA's tab)
// is the normal SPA's job.
if (!isSSG)
    watch([content, is404], () => {
        if (content.value) isLoading.value = false;

        document.title = is404.value
            ? `Page not found - ${appName}`
            : `${content.value?.seoTitle || content.value?.title} - ${appName}`;
    });

const text = computed(() => content.value?.text ?? "");

// Format a publish date in the locale of the translation being read (`selectedLanguageCode`), not the visitor's browser locale. Before the language resolves (or in the Node prerender) it falls back to the CMS default language's code — never a hardcoded constant — else luxon's system default.
const formatPublishDate = (ms: number) => {
    const code = selectedLanguageCode.value ?? cmsDefaultLanguage.value?.languageCode;
    const dt = DateTime.fromMillis(ms);
    return (code ? dt.setLocale(code) : dt).toLocaleString(DateTime.DATETIME_MED);
};

// Select the first category in the content by category list on load
watch(tags, () => {
    if (selectedCategoryId.value) return;
    const categories = tags.value.filter((t) => t.parentTagType == TagType.Category);
    if (categories.length) selectedCategoryId.value = categories[0].parentId;
});

const selectedCategory = computed(() => {
    if (!selectedCategoryId.value) return undefined;
    return tags.value.find((t) => t.parentId == selectedCategoryId.value);
});

const articleProseRef = ref<HTMLElement | null>(null);
const desktopTitleRef = ref<HTMLElement | null>(null);
const mobileTitleRef = ref<HTMLElement | null>(null);
const scrollContainer = ref<HTMLElement | Window>(window);

const readingTrackerEnabled = computed(() => !!content.value?._id && !!content.value?.text);

const contentId = computed(() => content.value?._id);

// Looked up from the full language map
const contentLanguage = computed(() => {
    const languageId = content.value?.language;
    return languageId ? languagesById.value.get(languageId) : undefined;
});

const averageReadingSpeed = computed(() =>
    resolveReadingSpeedWpm(contentLanguage.value?.averageReadingSpeed),
);

function setScrollContainer() {
    scrollContainer.value = resolveArticleScrollContainer();
}

const readingTime = computed<number>(() =>
    computeEstimatedReadingMinutes(content.value?.wordCount ?? 0, averageReadingSpeed.value),
);

const { hasResumableProgress, readingProgressPercent, restoreScrollPosition } =
    useReadingProgressTracker({
        contentId,
        articleRoot: articleProseRef,
        scrollContainer,
        enabled: readingTrackerEnabled,
        averageReadingSpeed,
        disableSaving: computed(() => readingTime.value <= 1),
        onSessionEnd: (endedContentId, finalDepthPercent) => {
            const endedTags = contentTagsById.get(endedContentId);
            contentTagsById.delete(endedContentId);
            const weight = readingDepthWeight(finalDepthPercent, affinityConfig.value);
            if (weight > 0) recordAffinity(endedTags, weight);
        },
    });

/** Hide the resume offer for this visit after the user continues, dismisses, or scrolls. */
const continuePromptHandled = ref(false);
const resumeOffered = computed(() => hasResumableProgress.value && !continuePromptHandled.value);

watch(contentId, () => {
    continuePromptHandled.value = false;
});

function onContinueReading() {
    continuePromptHandled.value = true;
    restoreScrollPosition();
}

onMounted(() => {
    setScrollContainer();
});

watch([isLoading, text], () => {
    if (!isLoading.value && text.value) {
        nextTick(setScrollContainer);
    }
});

const { selectedLanguageId, selectedLanguageCode } = useTranslationSwitcher({
    content,
    contentOverride,
    translations: availableTranslations,
    languages,
    preferredLanguageId: appLanguagePreferredIdAsRef,
    forcedLanguageCode: queryParams.get("langId"),
    router,
    translate: t,
});

const showDropdown = ref(false);

const quickLanguageSwitch = (languageId: string) => {
    markLanguageSwitch();
    selectedLanguageId.value = languageId;
    showDropdown.value = false;
};

// Check if the current content has audio files - fully reactive to data changes
const hasAudioFiles = computed(() => {
    // Check the live query result first (most up-to-date), then fall back to content ref
    const dataSource = contentArr.value[0] || content.value;
    const fileCollections = dataSource?.parentMedia?.fileCollections;
    return !!(fileCollections && Array.isArray(fileCollections) && fileCollections.length > 0);
});

// Function to start playing audio
const playAudio = () => {
    if (content.value && hasAudioFiles.value) {
        addToMediaQueue(content.value);
    }
};

watch([isLoading, content, is404], async () => {
    if (is404.value) {
        await nextTick();
        markPageReady();
        return;
    }
    if (!isLoading.value && content.value) {
        await nextTick();
        markPageReady();
    }
});
</script>

<template>
    <BasePage
        :showBackButton="true"
        desktopTopBar
        :reserveTopBarCenter="resumeOffered"
    >
        <!-- Reading pill: offers to resume on open, then stands in for the title as a chapter
             dropdown once it scrolls out of view. -->
        <template
            #topBarCenter
            v-if="!is404 && content && readingTrackerEnabled"
        >
            <ArticleOutline
                :articleRoot="articleProseRef"
                :scrollContainer="scrollContainer"
                :contentId="content._id"
                :title="content.title"
                :progress="readingProgressPercent"
                :resumable="hasResumableProgress"
                :offerResume="resumeOffered"
                :titleEls="[desktopTitleRef, mobileTitleRef]"
                @resume="onContinueReading"
                @dismiss="continuePromptHandled = true"
            />
        </template>
        <template
            #quickControls
            v-if="!is404"
        >
            <DropdownMenu
                v-if="!isLoading && !isLoadingTranslations && availableTranslations.length > 1"
                v-model:open="showDropdown"
                panel-class="py-1"
            >
                <template #trigger>
                    <button
                        type="button"
                        name="translationSelector"
                        class="block cursor-pointer truncate rounded-md px-1.5 py-1 text-sm text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                        data-test="translationSelector"
                    >
                        <span class="hidden sm:inline">
                            {{
                                languages.find(
                                    (lang: LanguageDto) => lang._id === selectedLanguageId,
                                )?.name
                            }}
                        </span>
                        <span class="inline sm:hidden">
                            {{
                                languages
                                    .find((lang: LanguageDto) => lang._id === selectedLanguageId)
                                    ?.languageCode.toUpperCase()
                            }}
                        </span>
                    </button>
                </template>
                <button
                    v-for="language in languages"
                    :key="language._id"
                    type="button"
                    role="menuitem"
                    @click="quickLanguageSwitch(language._id)"
                    class="flex w-full cursor-pointer select-none items-center gap-2 px-4 py-2 text-left text-sm leading-6 text-zinc-800 hover:bg-zinc-50 dark:text-white dark:hover:bg-slate-600"
                    data-test="translationOption"
                >
                    {{ language.name }}
                    <CheckCircleIcon
                        v-if="selectedLanguageId === language._id"
                        class="h-5 w-5 flex-shrink-0 text-yellow-500"
                        aria-hidden="true"
                    />
                </button>
            </DropdownMenu>
            <button
                type="button"
                class="cursor-pointer rounded-md p-1 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                data-test="themeButton"
                :aria-label="isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'"
                @click="theme = isDarkTheme ? 'light' : 'dark'"
            >
                <SunIcon
                    v-if="isDarkTheme"
                    class="h-5 w-5"
                    aria-hidden="true"
                />
                <MoonIcon
                    v-else
                    class="h-5 w-5"
                    aria-hidden="true"
                />
            </button>
        </template>

        <NotFoundPage v-if="is404" />

        <div
            v-else
            class="flex min-h-full flex-col gap-6"
            :class="{ 'mb-6': !tags.length }"
        >
            <div
                class="flex flex-grow justify-center lg:grid lg:grid-cols-[1fr_minmax(0,48rem)_1fr] lg:gap-x-8"
                :class="{ 'items-center': isLoading && !content }"
            >
                <LoadingBar
                    v-if="isLoading && !content"
                    :label="t('singlecontent.loading')"
                    class="lg:col-start-2"
                />

                <template v-else-if="content">
                    <article class="w-full lg:col-start-2">
                        <!-- Desktop: title row originates at the top of the page, level with the pinned
                         topbar chrome, and scrolls away with the content like normal. -->
                        <div
                            ref="desktopTitleRef"
                            class="hidden h-9 items-center justify-center gap-2 lg:flex"
                        >
                            <h1
                                class="truncate text-xl tracking-tight text-zinc-900 dark:text-slate-50 lg:text-2xl"
                            >
                                {{ content.title }}
                            </h1>
                            <button
                                v-if="canEdit() && cmsUrl"
                                @click="openCmsEditor"
                                class="flex flex-shrink-0 cursor-pointer items-center text-zinc-400 hover:text-yellow-500 dark:hover:text-yellow-400"
                                data-test="editButton"
                            >
                                <PencilIcon class="h-5 w-5" />
                            </button>
                        </div>

                        <div
                            ref="mobileTitleRef"
                            class="flex w-full flex-col items-center lg:hidden"
                        >
                            <div class="mt-1 flex flex-col gap-4 text-center md:mt-4">
                                <div class="flex flex-row items-start justify-center gap-2">
                                    <h1
                                        class="text-xl tracking-tight text-zinc-900 dark:text-slate-50 lg:text-2xl"
                                    >
                                        {{ content.title }}
                                    </h1>
                                    <button
                                        v-if="canEdit() && cmsUrl"
                                        @click="openCmsEditor"
                                        class="mt-1.5 flex cursor-pointer items-center text-zinc-400 hover:text-yellow-500 dark:hover:text-yellow-400"
                                        data-test="editButton"
                                    >
                                        <PencilIcon class="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="mt-5 lg:mt-2">
                            <IgnorePagePadding
                                :mobileOnly="true"
                                :ignoreTop="true"
                            >
                                <VideoPlayer
                                    v-if="content && content.video"
                                    :content="content"
                                    :language="selectedLanguageCode"
                                />
                                <div
                                    v-else-if="content.parentId || content.parentImageData"
                                    class="relative cursor-pointer overflow-hidden"
                                    @click="
                                        () => {
                                            if (content)
                                                currentImageIndex = activeImageCollection(content);
                                            enableZoom = true;
                                        }
                                    "
                                >
                                    <LImage
                                        :image="content.parentImageData"
                                        :content-parent-id="content.parentId"
                                        :parent-image-bucket-id="content.parentImageBucketId"
                                        aspectRatio="video"
                                        size="post"
                                    />
                                    <div
                                        v-if="
                                            (content.parentImageData?.fileCollections?.length ??
                                                0) > 1
                                        "
                                        class="absolute bottom-2 right-2 flex items-center gap-1"
                                    >
                                        <DocumentDuplicateIcon class="h-10 w-10 text-zinc-400" />
                                    </div>

                                    <!-- Small Play Audio Button (only show if content has audio but no video) -->
                                    <button
                                        v-if="hasAudioFiles"
                                        @click.stop="
                                            (event) => {
                                                playAudio();
                                                // Prevent focus staying on button
                                                (event.target as HTMLElement).blur();
                                            }
                                        "
                                        class="absolute bottom-2.5 left-3.5 flex items-center justify-center gap-1.5 rounded-full bg-black/60 py-1 pl-2 pr-3.5 text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                        title="Play Audio"
                                    >
                                        <SpeakerWaveIcon class="h-5 w-5" />
                                        {{ t("singlecontent.listen") }}
                                    </button>
                                </div>
                            </IgnorePagePadding>
                        </div>

                        <div
                            v-if="content.summary"
                            class="mt-6 flex justify-center"
                        >
                            <p
                                class="max-w-2xl text-center text-lg leading-relaxed text-zinc-600 dark:text-slate-300"
                            >
                                {{ content.summary }}
                            </p>
                        </div>

                        <div class="mt-6 flex flex-col items-center gap-4">
                            <div
                                class="flex w-fit flex-wrap items-center justify-center gap-y-2 border-t-2 border-yellow-500/25 px-8 pt-6 text-sm text-zinc-500 dark:text-slate-400"
                            >
                                <!-- Author -->
                                <div
                                    v-if="content.author"
                                    class="flex items-center after:px-2 after:font-normal after:text-zinc-300 after:content-['•'] last:after:hidden dark:after:text-slate-700"
                                >
                                    By {{ content.author }}
                                </div>

                                <!-- Reading Time -->
                                <div
                                    v-if="readingTime && readingTime > 1"
                                    class="flex items-center gap-1.5 after:px-2 after:text-zinc-300 after:content-['•'] last:after:hidden dark:after:text-slate-700"
                                >
                                    <ClockIcon class="h-4 w-4 flex-shrink-0" />
                                    <span>{{ readingTime }} min</span>
                                </div>

                                <!-- Publish Date -->
                                <div
                                    v-if="content.publishDate && content.parentPublishDateVisible"
                                    class="flex items-center text-center after:px-2 after:text-zinc-300 after:content-['•'] last:after:hidden dark:after:text-slate-700 sm:text-left"
                                >
                                    {{ formatPublishDate(content.publishDate) }}
                                </div>

                                <!-- Fallback language: shown when the article isn't available in a
                                 language the user chose (it fell through to the default / another).
                                 Renders nothing for chosen-language content, so no stray separator. -->
                                <FallbackLanguageBadge :content="content" />
                            </div>

                            <!-- Bookmark Button -->
                            <button
                                v-if="
                                    !(
                                        content.parentPostType &&
                                        content.parentPostType == PostType.Page
                                    )
                                "
                                @click="toggleBookmark"
                                data-test="bookmark"
                                class="flex items-center transition-colors"
                            >
                                <component
                                    :is="isBookmarked ? BookmarkIconSolid : BookmarkIconOutline"
                                    class="h-5 w-5"
                                    :class="{
                                        'text-yellow-500': isBookmarked,
                                        'text-zinc-400 hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-200':
                                            !isBookmarked,
                                    }"
                                />
                            </button>
                        </div>

                        <div
                            class="mt-6 flex flex-wrap justify-center gap-2"
                            v-if="categoryTags.length"
                        >
                            <span
                                v-for="tag in categoryTags"
                                :key="tag._id"
                                @click="
                                    selectedCategoryId = tag.parentId;
                                    showCategoryModal = true;
                                "
                                class="flex cursor-pointer items-center justify-center rounded-lg border border-yellow-500/25 bg-yellow-500/10 py-1 pl-1 pr-2 text-sm hover:bg-yellow-100/25 dark:bg-slate-700 dark:hover:bg-yellow-100/25"
                            >
                                <TagIcon class="mr-2 h-5 w-5 text-yellow-500/75" />
                                <span class="line-clamp-1">{{ tag.title }}</span>
                            </span>
                        </div>

                        <!-- Render content with highlighting support -->
                        <LHighlightable
                            v-if="content.text"
                            :content-id="content._id"
                            @highlighted="
                                recordAffinity(
                                    content?.parentTags,
                                    affinityConfig.eventWeight.highlight,
                                )
                            "
                            @highlight-removed="
                                recordAffinity(
                                    content?.parentTags,
                                    affinityConfig.eventWeight.highlightRemoved,
                                )
                            "
                            @highlights-changed="notifyHighlightsChanged"
                        >
                            <div
                                ref="articleProseRef"
                                :data-ssr-article-text="isPrerender() ? true : undefined"
                                v-html="text"
                                class="prose prose-zinc mt-8 max-w-full dark:prose-invert lg:prose-lg prose-headings:font-bold prose-a:text-yellow-600 dark:prose-a:text-yellow-400"
                                :class="{
                                    'border-t border-zinc-100 pt-8 dark:border-slate-800':
                                        categoryTags.length == 0,
                                }"
                            ></div> </LHighlightable
                        ><br />
                        <div
                            v-if="content.copyright"
                            class="text-xs text-zinc-500 dark:text-slate-300"
                        >
                            {{ content.copyright }}
                        </div>
                    </article>

                    <!-- Right gutter: kept empty, mirrors the left one so the article stays centred. -->
                    <div class="hidden lg:block" />
                </template>
            </div>

            <IgnorePagePadding v-if="content && tags.length">
                <RelatedContent
                    :selectedContent="content"
                    :tags="
                        tags.filter(
                            (t: ContentDto) =>
                                t && t.parentTagType && t.parentTagType == TagType.Topic,
                        )
                    "
                />
            </IgnorePagePadding>
            <IgnorePagePadding ignoreBottom>
                <CopyrightBanner />
            </IgnorePagePadding>
        </div>
    </BasePage>

    <LModal
        :isVisible="showCategoryModal"
        @close="showCategoryModal = false"
        :heading="selectedCategory?.title || ''"
    >
        <div class="max-h-[calc(80%)] overflow-y-auto">
            <div class="">
                <VerticalTagViewer
                    v-if="selectedCategory"
                    :tag="selectedCategory"
                    class=""
                />
            </div>
        </div>
    </LModal>

    <ImageModal
        v-if="content && enableZoom"
        :content-parent-id="content.parentId"
        :parent-image-bucket-id="content.parentImageBucketId"
        :imageCollections="content?.parentImageData?.fileCollections"
        :currentIndex="currentImageIndex"
        aspectRatio="original"
        @update:index="currentImageIndex = $event"
        @close="enableZoom = false"
    />
</template>
