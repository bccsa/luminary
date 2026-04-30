<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LCard from "@/components/common/LCard.vue";
import LBadge from "@/components/common/LBadge.vue";
import LButton from "@/components/button/LButton.vue";
import { RouterLink } from "vue-router";
import { computed, onUnmounted, ref, watch, nextTick } from "vue";
import {
    db,
    DocType,
    PostType,
    TagType,
    PublishStatus,
    useDexieLiveQuery,
    useDexieLiveQueryWithDeps,
    type ContentDto,
    type PostDto,
    type TagDto,
    type GroupDto,
    type LocalChangeDto,
    hasAnyPermission,
    AclPermission,
    isConnected,
    syncActive,
} from "luminary-shared";
import { cmsLanguages, cmsLanguageIdAsRef } from "@/globalConfig";
import { useAuth0 } from "@auth0/auth0-vue";
import { isAuthBypassed } from "@/auth";
import {
    DocumentDuplicateIcon,
    TagIcon,
    GlobeEuropeAfricaIcon,
    PencilSquareIcon,
    ClockIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    RectangleStackIcon,
    DocumentTextIcon,
    CalendarDaysIcon,
} from "@heroicons/vue/20/solid";
import { DateTime } from "luxon";

// --- User ---

const auth0 = isAuthBypassed ? null : useAuth0();
const userName = computed(() =>
    isAuthBypassed ? "E2E Test User" : (auth0?.user.value?.name ?? "User"),
);

const greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
});

// --- Stat queries ---

const posts = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Post }).toArray() as unknown as Promise<PostDto[]>,
    { initialValue: [] as PostDto[] },
);

const tags = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Tag }).toArray() as unknown as Promise<TagDto[]>,
    { initialValue: [] as TagDto[] },
);

const groups = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Group }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

const allContentDocs = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Content }).toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: [] as ContentDto[] },
);

const contentDocs = useDexieLiveQueryWithDeps(
    cmsLanguageIdAsRef,
    (langId: string) =>
        db.docs.where({ type: DocType.Content, language: langId }).toArray() as unknown as Promise<
            ContentDto[]
        >,
    { initialValue: [] as ContentDto[] },
);

const pendingChanges = useDexieLiveQuery(
    () => db.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>,
    { initialValue: [] as LocalChangeDto[] },
);

// --- Computed stats ---

const publishedCount = computed(
    () => contentDocs.value.filter((d) => d.status === PublishStatus.Published).length,
);
const draftCount = computed(
    () => contentDocs.value.filter((d) => d.status === PublishStatus.Draft).length,
);

const scheduledContent = computed(() => {
    const now = Date.now();
    return contentDocs.value
        .filter((d) => d.status === PublishStatus.Published && d.publishDate && d.publishDate > now)
        .sort((a, b) => (a.publishDate ?? 0) - (b.publishDate ?? 0));
});

const expiredContent = computed(() => {
    const now = Date.now();
    return contentDocs.value
        .filter((d) => d.expiryDate && d.expiryDate < now)
        .sort((a, b) => (b.expiryDate ?? 0) - (a.expiryDate ?? 0));
});

// --- Content by type breakdown ---

const contentByParentType = computed(() => {
    let post = 0;
    let tag = 0;
    for (const d of contentDocs.value) {
        if (d.parentType === DocType.Post) post++;
        else if (d.parentType === DocType.Tag) tag++;
    }
    return { post, tag };
});

// --- Missing translations ---

const allParentTranslations = computed(() => {
    if (cmsLanguages.value.length === 0) return [];

    const parentLanguageMap = new Map<string, Set<string>>();
    const parentTitleMap = new Map<string, string>();
    const parentTypeMap = new Map<
        string,
        { parentType?: DocType; parentPostType?: PostType; parentTagType?: TagType }
    >();

    for (const doc of allContentDocs.value) {
        if (!parentLanguageMap.has(doc.parentId)) {
            parentLanguageMap.set(doc.parentId, new Set());
        }
        parentLanguageMap.get(doc.parentId)!.add(doc.language);

        if (doc.language === cmsLanguageIdAsRef.value || !parentTitleMap.has(doc.parentId)) {
            parentTitleMap.set(doc.parentId, doc.title);
            parentTypeMap.set(doc.parentId, {
                parentType: doc.parentType,
                parentPostType: doc.parentPostType,
                parentTagType: doc.parentTagType,
            });
        }
    }

    const total = cmsLanguages.value.length;
    return Array.from(parentLanguageMap, ([parentId, langs]) => ({
        parentId,
        title: parentTitleMap.get(parentId) ?? "Untitled",
        translatedLanguages: langs,
        translated: langs.size,
        total,
        ...parentTypeMap.get(parentId),
    }));
});

// --- Dynamic capacity (fit lists to container without scrolling) ---

const recentListEl = ref<HTMLElement | null>(null);
const recentActivityCapacity = ref(20);

const missingListEl = ref<HTMLElement | null>(null);
const missingTranslationsCapacity = ref(20);

let resizeObserver: ResizeObserver | null = null;
let observedRecent: HTMLElement | null = null;
let observedMissing: HTMLElement | null = null;

function computeCapacity(ulEl: HTMLElement | null): number {
    if (!ulEl) return 20;
    const parent = ulEl.parentElement;
    if (!parent) return 20;
    const firstItem = ulEl.querySelector("li") as HTMLElement | null;
    const itemHeight = firstItem?.offsetHeight ?? 32;
    if (itemHeight <= 0) return 20;
    const style = getComputedStyle(parent);
    const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const available = parent.clientHeight - paddingY;
    return Math.max(1, Math.floor(available / itemHeight));
}

function updateCapacities() {
    recentActivityCapacity.value = computeCapacity(recentListEl.value);
    missingTranslationsCapacity.value = computeCapacity(missingListEl.value);
}

function ensureObserver(): ResizeObserver {
    if (!resizeObserver) resizeObserver = new ResizeObserver(updateCapacities);
    return resizeObserver;
}

watch(recentListEl, (el) => {
    if (observedRecent) {
        resizeObserver?.unobserve(observedRecent);
        observedRecent = null;
    }
    if (el?.parentElement) {
        ensureObserver().observe(el.parentElement);
        observedRecent = el.parentElement;
    }
    nextTick(updateCapacities);
});

watch(missingListEl, (el) => {
    if (observedMissing) {
        resizeObserver?.unobserve(observedMissing);
        observedMissing = null;
    }
    if (el?.parentElement) {
        ensureObserver().observe(el.parentElement);
        observedMissing = el.parentElement;
    }
    nextTick(updateCapacities);
});

onUnmounted(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
});

const missingTranslations = computed(() => {
    if (cmsLanguages.value.length <= 1) return [];
    return allParentTranslations.value
        .filter((p) => p.translated < p.total)
        .sort((a, b) => a.translated - b.translated)
        .slice(0, Math.min(missingTranslationsCapacity.value, 30));
});

// --- Recent activity ---

const recentContent = computed(() =>
    [...contentDocs.value]
        .sort((a, b) => b.updatedTimeUtc - a.updatedTimeUtc)
        .slice(0, Math.min(recentActivityCapacity.value, 50)),
);

watch([recentContent, missingTranslations], () => nextTick(updateCapacities));

function formatRelativeTime(timestamp: number): string {
    return DateTime.fromMillis(timestamp).toRelative() ?? "";
}

function formatDate(timestamp: number): string {
    return DateTime.fromMillis(timestamp).toLocaleString(DateTime.DATE_MED);
}

function parentRoute(doc: {
    parentId: string;
    parentType?: DocType;
    parentPostType?: PostType;
    parentTagType?: TagType;
}) {
    if (!doc.parentType) return undefined;

    const typeParam =
        doc.parentType === DocType.Post
            ? (doc.parentPostType ?? PostType.Blog)
            : (doc.parentTagType ?? TagType.Category);

    return {
        name: "edit",
        params: {
            docType: doc.parentType,
            tagOrPostType: typeParam,
            id: doc.parentId,
        },
    };
}

// --- Translation progress ---

const contentCountPerLanguage = computed(() => {
    const counts: Record<string, number> = {};
    for (const doc of allContentDocs.value) {
        counts[doc.language] = (counts[doc.language] ?? 0) + 1;
    }
    return counts;
});

const maxContentCount = computed(() => {
    const values = Object.values(contentCountPerLanguage.value);
    return values.length ? Math.max(...values) : 0;
});

const canViewPosts = hasAnyPermission(DocType.Post, AclPermission.View);
const canViewTags = hasAnyPermission(DocType.Tag, AclPermission.View);
const canViewGroups = hasAnyPermission(DocType.Group, AclPermission.View);
</script>

<template>
    <BasePage title="Dashboard" :should-show-page-title="false" is-full-width>
        <div class="flex flex-col gap-3 p-3 sm:p-4 lg:h-full lg:min-h-0">
            <!-- Header with greeting and status -->
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-col lg:flex-row lg:items-baseline lg:gap-2">
                    <h1 class="text-lg font-semibold text-zinc-900">
                        {{ greeting }}, {{ userName }}
                    </h1>
                    <p class="text-xs text-zinc-500">Here's what's happening today</p>
                </div>
                <div class="flex items-center gap-2">
                    <!-- Sync indicator -->
                    <div
                        v-if="syncActive"
                        class="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                    >
                        <ArrowPathIcon class="h-3.5 w-3.5 animate-spin" />
                        Syncing
                    </div>
                </div>
            </div>

            <!-- Stat cards -->
            <div class="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <RouterLink
                    v-if="canViewPosts"
                    :to="{
                        name: 'overview',
                        params: { docType: DocType.Post, tagOrPostType: PostType.Blog },
                    }"
                    class="group rounded-lg border border-zinc-200 bg-white px-3 py-2 transition-colors hover:border-zinc-300"
                >
                    <div class="flex items-center gap-2 text-zinc-500">
                        <DocumentDuplicateIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Posts</span>
                    </div>
                    <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                        {{ posts.length }}
                    </p>
                    <p class="text-xs text-zinc-400">
                        {{ contentByParentType.post }} content item{{
                            contentByParentType.post !== 1 ? "s" : ""
                        }}
                    </p>
                </RouterLink>

                <RouterLink
                    v-if="canViewTags"
                    :to="{
                        name: 'overview',
                        params: { docType: DocType.Tag, tagOrPostType: TagType.Category },
                    }"
                    class="group rounded-lg border border-zinc-200 bg-white px-3 py-2 transition-colors hover:border-zinc-300"
                >
                    <div class="flex items-center gap-2 text-zinc-500">
                        <TagIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Tags</span>
                    </div>
                    <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                        {{ tags.length }}
                    </p>
                    <p class="text-xs text-zinc-400">
                        {{ contentByParentType.tag }} content item{{
                            contentByParentType.tag !== 1 ? "s" : ""
                        }}
                    </p>
                </RouterLink>

                <div class="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    <div class="flex items-center gap-2 text-zinc-500">
                        <CheckCircleIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Published</span>
                    </div>
                    <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                        {{ publishedCount }}
                    </p>
                    <p v-if="draftCount > 0" class="text-xs text-zinc-400">
                        {{ draftCount }} draft{{ draftCount !== 1 ? "s" : "" }}
                    </p>
                </div>

                <div class="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    <div class="flex items-center gap-2 text-zinc-500">
                        <CalendarDaysIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Scheduled</span>
                    </div>
                    <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                        {{ scheduledContent.length }}
                    </p>
                    <p v-if="expiredContent.length > 0" class="text-xs text-amber-500">
                        {{ expiredContent.length }} expired
                    </p>
                </div>

                <RouterLink
                    v-if="canViewGroups"
                    :to="{ name: 'groups' }"
                    class="group rounded-lg border border-zinc-200 bg-white px-3 py-2 transition-colors hover:border-zinc-300"
                >
                    <div class="flex items-center gap-2 text-zinc-500">
                        <RectangleStackIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Groups</span>
                    </div>
                    <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                        {{ groups.length }}
                    </p>
                    <p class="text-xs text-zinc-400">
                        {{ cmsLanguages.length }} language{{ cmsLanguages.length !== 1 ? "s" : "" }}
                    </p>
                </RouterLink>
            </div>

            <!-- Language coverage (mobile only) -->
            <LCard
                title="Language coverage"
                :icon="GlobeEuropeAfricaIcon"
                class="lg:hidden"
            >
                <div
                    v-if="cmsLanguages.length === 0"
                    class="py-4 text-center text-sm text-zinc-400"
                >
                    No languages configured.
                </div>
                <ul v-else class="space-y-1.5">
                    <li v-for="lang in cmsLanguages" :key="lang._id">
                        <div class="flex items-center justify-between text-sm">
                            <span
                                class="font-medium"
                                :class="
                                    lang._id === cmsLanguageIdAsRef
                                        ? 'text-yellow-600'
                                        : 'text-zinc-700'
                                "
                            >
                                {{ lang.name }}
                                <span class="text-xs text-zinc-400">
                                    ({{ lang.languageCode }})
                                </span>
                            </span>
                            <span class="text-xs tabular-nums text-zinc-500">
                                {{ contentCountPerLanguage[lang._id] ?? 0 }}
                            </span>
                        </div>
                        <div
                            class="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100"
                        >
                            <div
                                class="h-full rounded-full transition-all"
                                :class="
                                    lang._id === cmsLanguageIdAsRef
                                        ? 'bg-yellow-500'
                                        : 'bg-zinc-300'
                                "
                                :style="{
                                    width:
                                        maxContentCount > 0
                                            ? `${((contentCountPerLanguage[lang._id] ?? 0) / maxContentCount) * 100}%`
                                            : '0%',
                                }"
                            />
                        </div>
                    </li>
                </ul>
            </LCard>

            <!-- Status banners -->
            <div
                v-if="pendingChanges.length > 0 || expiredContent.length > 0"
                class="flex flex-wrap gap-2"
            >
                <div
                    v-if="pendingChanges.length > 0"
                    class="flex flex-1 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5"
                >
                    <ArrowPathIcon class="h-4 w-4 shrink-0 text-amber-500" />
                    <p class="text-xs font-medium text-amber-800">
                        {{ pendingChanges.length }} pending change{{
                            pendingChanges.length !== 1 ? "s" : ""
                        }}
                    </p>
                    <p class="text-xs text-amber-600">
                        {{ isConnected ? "Syncing with server..." : "Will sync when back online" }}
                    </p>
                </div>
                <div
                    v-if="expiredContent.length > 0"
                    class="flex flex-1 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5"
                >
                    <ExclamationTriangleIcon class="h-4 w-4 shrink-0 text-orange-500" />
                    <p class="text-xs font-medium text-orange-800">
                        {{ expiredContent.length }} expired item{{
                            expiredContent.length !== 1 ? "s" : ""
                        }}
                    </p>
                    <p class="text-xs text-orange-600">Content past its expiry date</p>
                </div>
            </div>

            <!-- Main content grid -->
            <div class="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
                <!-- Recent activity (2/3 width) -->
                <div class="flex flex-col gap-3 lg:col-span-2 lg:min-h-0">
                    <LCard title="Recent activity" :icon="ClockIcon" fillHeight>
                        <div
                            v-if="recentContent.length === 0"
                            class="py-6 text-center text-sm text-zinc-400"
                        >
                            No content found for the selected language.
                        </div>
                        <ul v-else ref="recentListEl" class="divide-y divide-zinc-100">
                            <li
                                v-for="doc in recentContent"
                                :key="doc._id"
                                class="flex items-center gap-2 py-1.5"
                            >
                                <component
                                    :is="
                                        doc.parentType === DocType.Post ? DocumentTextIcon : TagIcon
                                    "
                                    class="h-4 w-4 shrink-0 text-zinc-300"
                                />
                                <RouterLink
                                    v-if="parentRoute(doc)"
                                    :to="parentRoute(doc)!"
                                    class="min-w-0 truncate text-sm font-medium text-zinc-900 hover:text-yellow-600"
                                >
                                    {{ doc.title || "Untitled" }}
                                </RouterLink>
                                <span
                                    v-else
                                    class="min-w-0 truncate text-sm font-medium text-zinc-900"
                                >
                                    {{ doc.title || "Untitled" }}
                                </span>
                                <span
                                    v-if="doc.author"
                                    class="ml-auto hidden truncate text-xs text-zinc-400 sm:inline"
                                >
                                    by {{ doc.author }}
                                </span>
                                <span
                                    class="shrink-0 text-xs text-zinc-400"
                                    :class="{ 'ml-auto': !doc.author }"
                                >
                                    {{ formatRelativeTime(doc.updatedTimeUtc) }}
                                </span>
                                <LBadge
                                    :variant="
                                        doc.status === PublishStatus.Published
                                            ? 'success'
                                            : 'default'
                                    "
                                    paddingY="py-0.5"
                                    paddingX="px-1.5"
                                >
                                    {{ doc.status }}
                                </LBadge>
                            </li>
                        </ul>
                    </LCard>

                    <!-- Scheduled content -->
                    <LCard
                        v-if="scheduledContent.length > 0"
                        title="Upcoming scheduled"
                        :icon="CalendarDaysIcon"
                        collapsible
                        defaultCollapsed
                    >
                        <ul class="divide-y divide-zinc-100">
                            <li
                                v-for="doc in scheduledContent.slice(0, 5)"
                                :key="doc._id"
                                class="flex items-center justify-between gap-3 py-1.5"
                            >
                                <div class="min-w-0 flex-1">
                                    <RouterLink
                                        v-if="parentRoute(doc)"
                                        :to="parentRoute(doc)!"
                                        class="truncate text-sm font-medium text-zinc-900 hover:text-yellow-600"
                                    >
                                        {{ doc.title || "Untitled" }}
                                    </RouterLink>
                                    <span v-else class="truncate text-sm font-medium text-zinc-900">
                                        {{ doc.title || "Untitled" }}
                                    </span>
                                </div>
                                <span class="shrink-0 text-xs text-zinc-500">
                                    {{ formatDate(doc.publishDate!) }}
                                </span>
                            </li>
                        </ul>
                    </LCard>
                </div>

                <!-- Right column (1/3 width) -->
                <div class="flex flex-col gap-3 lg:min-h-0">
                    <!-- Language overview -->
                    <LCard
                        title="Translation coverage"
                        :icon="GlobeEuropeAfricaIcon"
                        class="max-lg:hidden"
                    >
                        <div
                            v-if="cmsLanguages.length === 0"
                            class="py-4 text-center text-sm text-zinc-400"
                        >
                            No languages configured.
                        </div>
                        <ul v-else class="space-y-1.5">
                            <li v-for="lang in cmsLanguages" :key="lang._id">
                                <div class="flex items-center justify-between text-sm">
                                    <span
                                        class="font-medium"
                                        :class="
                                            lang._id === cmsLanguageIdAsRef
                                                ? 'text-yellow-600'
                                                : 'text-zinc-700'
                                        "
                                    >
                                        {{ lang.name }}
                                        <span class="text-xs text-zinc-400">
                                            ({{ lang.languageCode }})
                                        </span>
                                    </span>
                                    <span class="text-xs tabular-nums text-zinc-500">
                                        {{ contentCountPerLanguage[lang._id] ?? 0 }}
                                    </span>
                                </div>
                                <div
                                    class="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100"
                                >
                                    <div
                                        class="h-full rounded-full transition-all"
                                        :class="
                                            lang._id === cmsLanguageIdAsRef
                                                ? 'bg-yellow-500'
                                                : 'bg-zinc-300'
                                        "
                                        :style="{
                                            width:
                                                maxContentCount > 0
                                                    ? `${((contentCountPerLanguage[lang._id] ?? 0) / maxContentCount) * 100}%`
                                                    : '0%',
                                        }"
                                    />
                                </div>
                            </li>
                        </ul>
                    </LCard>

                    <!-- Missing translations -->
                    <LCard v-if="missingTranslations.length > 0" fillHeight>
                        <div class="flex flex-col gap-2 lg:h-full">
                            <div class="flex items-center justify-center gap-2">
                                <PencilSquareIcon class="h-4 w-4 text-zinc-600" />
                                <h3 class="text-sm font-semibold leading-6 text-zinc-900">
                                    Needs translation
                                </h3>
                            </div>
                            <div class="flex w-full justify-center">
                                <div class="inline-flex w-full">
                                    <LButton
                                        :is="RouterLink"
                                        :to="{
                                            name: 'overview',
                                            params: {
                                                docType: DocType.Post,
                                                tagOrPostType: PostType.Blog,
                                            },
                                        }"
                                        variant="secondary"
                                        size="sm"
                                        class="w-full rounded-r-none"
                                    >
                                        Blogs
                                    </LButton>
                                    <LButton
                                        :is="RouterLink"
                                        :to="{
                                            name: 'overview',
                                            params: {
                                                docType: DocType.Post,
                                                tagOrPostType: PostType.Page,
                                            },
                                        }"
                                        variant="secondary"
                                        size="sm"
                                        class="-ml-px w-full rounded-l-none"
                                    >
                                        Pages
                                    </LButton>
                                </div>
                            </div>
                            <div class="lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                                <ul ref="missingListEl" class="divide-y divide-zinc-100">
                                    <li
                                        v-for="item in missingTranslations"
                                        :key="item.parentId"
                                        class="py-1.5"
                                    >
                                        <div class="flex items-center justify-between gap-2">
                                            <RouterLink
                                                v-if="parentRoute(item)"
                                                :to="parentRoute(item)!"
                                                class="min-w-0 truncate text-sm text-zinc-900 hover:text-yellow-600"
                                            >
                                                {{ item.title }}
                                            </RouterLink>
                                            <span
                                                v-else
                                                class="min-w-0 truncate text-sm text-zinc-900"
                                            >
                                                {{ item.title }}
                                            </span>
                                            <span
                                                class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                                            >
                                                {{ item.translated }}/{{ item.total }}
                                            </span>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </LCard>
                </div>
            </div>
        </div>
    </BasePage>
</template>
