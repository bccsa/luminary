<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LCard from "@/components/common/LCard.vue";
import { RouterLink } from "vue-router";
import { computed } from "vue";
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
    SignalIcon,
    SignalSlashIcon,
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

const now = Date.now();
const scheduledContent = computed(() =>
    contentDocs.value
        .filter((d) => d.status === PublishStatus.Published && d.publishDate && d.publishDate > now)
        .sort((a, b) => (a.publishDate ?? 0) - (b.publishDate ?? 0)),
);

const expiredContent = computed(() =>
    contentDocs.value
        .filter((d) => d.expiryDate && d.expiryDate < now)
        .sort((a, b) => (b.expiryDate ?? 0) - (a.expiryDate ?? 0)),
);

// --- Content by type breakdown ---

const contentByParentType = computed(() => {
    const postContent = contentDocs.value.filter((d) => d.parentType === DocType.Post);
    const tagContent = contentDocs.value.filter((d) => d.parentType === DocType.Tag);
    return { post: postContent.length, tag: tagContent.length };
});

// --- Missing translations ---

const missingTranslations = computed(() => {
    if (cmsLanguages.value.length <= 1) return [];

    // Group content by parentId to find which parents are missing translations
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

        // Keep the title from the current language if available, otherwise any title
        if (doc.language === cmsLanguageIdAsRef.value || !parentTitleMap.has(doc.parentId)) {
            parentTitleMap.set(doc.parentId, doc.title);
            parentTypeMap.set(doc.parentId, {
                parentType: doc.parentType,
                parentPostType: doc.parentPostType,
                parentTagType: doc.parentTagType,
            });
        }
    }

    const totalLanguages = cmsLanguages.value.length;
    const missing: {
        parentId: string;
        title: string;
        translated: number;
        total: number;
        parentType?: DocType;
        parentPostType?: PostType;
        parentTagType?: TagType;
    }[] = [];

    for (const [parentId, langs] of parentLanguageMap) {
        if (langs.size < totalLanguages) {
            missing.push({
                parentId,
                title: parentTitleMap.get(parentId) ?? "Untitled",
                translated: langs.size,
                total: totalLanguages,
                ...parentTypeMap.get(parentId),
            });
        }
    }

    // Sort by fewest translations first
    return missing.sort((a, b) => a.translated - b.translated).slice(0, 6);
});

// --- Recent activity ---

const recentContent = computed(() =>
    [...contentDocs.value].sort((a, b) => b.updatedTimeUtc - a.updatedTimeUtc).slice(0, 10),
);

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

const translationProgress = computed(() => {
    if (!cmsLanguages.value.length) return [];

    return cmsLanguages.value.map((lang) => ({
        id: lang._id,
        name: lang.name,
        languageCode: lang.languageCode,
        isCurrent: lang._id === cmsLanguageIdAsRef.value,
    }));
});

const contentCountPerLanguage = useDexieLiveQuery(
    async () => {
        const counts: Record<string, number> = {};
        for (const lang of cmsLanguages.value) {
            counts[lang._id] = await db.docs
                .where({ type: DocType.Content, language: lang._id })
                .count();
        }
        return counts;
    },
    { initialValue: {} as Record<string, number> },
);

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
        <div class="space-y-6 p-3 sm:p-5">
            <!-- Header with greeting and status -->
            <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 class="text-xl font-semibold text-zinc-900">
                        {{ greeting }}, {{ userName }}
                    </h1>
                    <p class="mt-1 text-sm text-zinc-500">
                        Here's what's happening with your content
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <!-- Sync indicator -->
                    <div
                        v-if="syncActive"
                        class="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                    >
                        <ArrowPathIcon class="h-3.5 w-3.5 animate-spin" />
                        Syncing
                    </div>
                    <!-- Connection status -->
                    <div
                        class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                        :class="
                            isConnected
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                        "
                    >
                        <component
                            :is="isConnected ? SignalIcon : SignalSlashIcon"
                            class="h-3.5 w-3.5"
                        />
                        {{ isConnected ? "Online" : "Offline" }}
                    </div>
                </div>
            </div>

            <!-- Stat cards -->
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <RouterLink
                    v-if="canViewPosts"
                    :to="{
                        name: 'overview',
                        params: { docType: DocType.Post, tagOrPostType: PostType.Blog },
                    }"
                    class="group rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
                >
                    <div class="flex items-center gap-2 text-zinc-500">
                        <DocumentDuplicateIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Posts</span>
                    </div>
                    <p class="mt-2 text-2xl font-semibold text-zinc-900">{{ posts.length }}</p>
                    <p class="mt-0.5 text-xs text-zinc-400">
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
                    class="group rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
                >
                    <div class="flex items-center gap-2 text-zinc-500">
                        <TagIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Tags</span>
                    </div>
                    <p class="mt-2 text-2xl font-semibold text-zinc-900">{{ tags.length }}</p>
                    <p class="mt-0.5 text-xs text-zinc-400">
                        {{ contentByParentType.tag }} content item{{
                            contentByParentType.tag !== 1 ? "s" : ""
                        }}
                    </p>
                </RouterLink>

                <div class="rounded-lg border border-zinc-200 bg-white p-4">
                    <div class="flex items-center gap-2 text-zinc-500">
                        <CheckCircleIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Published</span>
                    </div>
                    <p class="mt-2 text-2xl font-semibold text-zinc-900">{{ publishedCount }}</p>
                    <p v-if="draftCount > 0" class="mt-0.5 text-xs text-zinc-400">
                        {{ draftCount }} draft{{ draftCount !== 1 ? "s" : "" }}
                    </p>
                </div>

                <div class="rounded-lg border border-zinc-200 bg-white p-4">
                    <div class="flex items-center gap-2 text-zinc-500">
                        <CalendarDaysIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Scheduled</span>
                    </div>
                    <p class="mt-2 text-2xl font-semibold text-zinc-900">
                        {{ scheduledContent.length }}
                    </p>
                    <p v-if="expiredContent.length > 0" class="mt-0.5 text-xs text-amber-500">
                        {{ expiredContent.length }} expired
                    </p>
                </div>

                <RouterLink
                    v-if="canViewGroups"
                    :to="{ name: 'groups' }"
                    class="group rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
                >
                    <div class="flex items-center gap-2 text-zinc-500">
                        <RectangleStackIcon class="h-4 w-4" />
                        <span class="text-xs font-medium uppercase tracking-wide">Groups</span>
                    </div>
                    <p class="mt-2 text-2xl font-semibold text-zinc-900">{{ groups.length }}</p>
                    <p class="mt-0.5 text-xs text-zinc-400">
                        {{ cmsLanguages.length }} language{{ cmsLanguages.length !== 1 ? "s" : "" }}
                    </p>
                </RouterLink>
            </div>

            <!-- Status banners -->
            <div class="flex flex-wrap gap-3">
                <div
                    v-if="pendingChanges.length > 0"
                    class="flex flex-1 items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
                >
                    <ArrowPathIcon class="h-5 w-5 shrink-0 text-amber-500" />
                    <div>
                        <p class="text-sm font-medium text-amber-800">
                            {{ pendingChanges.length }} pending change{{
                                pendingChanges.length !== 1 ? "s" : ""
                            }}
                        </p>
                        <p class="text-xs text-amber-600">
                            {{
                                isConnected
                                    ? "Syncing with server..."
                                    : "Will sync when back online"
                            }}
                        </p>
                    </div>
                </div>
                <div
                    v-if="expiredContent.length > 0"
                    class="flex flex-1 items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3"
                >
                    <ExclamationTriangleIcon class="h-5 w-5 shrink-0 text-orange-500" />
                    <div>
                        <p class="text-sm font-medium text-orange-800">
                            {{ expiredContent.length }} expired item{{
                                expiredContent.length !== 1 ? "s" : ""
                            }}
                        </p>
                        <p class="text-xs text-orange-600">Content past its expiry date</p>
                    </div>
                </div>
            </div>

            <!-- Main content grid -->
            <div class="grid gap-6 lg:grid-cols-3">
                <!-- Recent activity (2/3 width) -->
                <div class="space-y-6 lg:col-span-2">
                    <LCard title="Recent activity" :icon="ClockIcon">
                        <div
                            v-if="recentContent.length === 0"
                            class="py-8 text-center text-sm text-zinc-400"
                        >
                            No content found for the selected language.
                        </div>
                        <ul v-else class="divide-y divide-zinc-100">
                            <li
                                v-for="doc in recentContent"
                                :key="doc._id"
                                class="flex items-center justify-between gap-3 py-2.5"
                            >
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2">
                                        <component
                                            :is="
                                                doc.parentType === DocType.Post
                                                    ? DocumentTextIcon
                                                    : TagIcon
                                            "
                                            class="h-4 w-4 shrink-0 text-zinc-300"
                                        />
                                        <RouterLink
                                            v-if="parentRoute(doc)"
                                            :to="parentRoute(doc)!"
                                            class="truncate text-sm font-medium text-zinc-900 hover:text-yellow-600"
                                        >
                                            {{ doc.title || "Untitled" }}
                                        </RouterLink>
                                        <span
                                            v-else
                                            class="truncate text-sm font-medium text-zinc-900"
                                        >
                                            {{ doc.title || "Untitled" }}
                                        </span>
                                    </div>
                                    <div
                                        class="mt-0.5 flex items-center gap-2 pl-6 text-xs text-zinc-400"
                                    >
                                        <span
                                            class="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                                            :class="
                                                doc.status === PublishStatus.Published
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'bg-zinc-100 text-zinc-600'
                                            "
                                        >
                                            {{ doc.status }}
                                        </span>
                                        <span v-if="doc.author" class="truncate">
                                            by {{ doc.author }}
                                        </span>
                                    </div>
                                </div>
                                <span class="shrink-0 text-xs text-zinc-400">
                                    {{ formatRelativeTime(doc.updatedTimeUtc) }}
                                </span>
                            </li>
                        </ul>
                    </LCard>

                    <!-- Scheduled content -->
                    <LCard
                        v-if="scheduledContent.length > 0"
                        title="Upcoming scheduled"
                        :icon="CalendarDaysIcon"
                        collapsible
                    >
                        <ul class="divide-y divide-zinc-100">
                            <li
                                v-for="doc in scheduledContent.slice(0, 5)"
                                :key="doc._id"
                                class="flex items-center justify-between gap-3 py-2.5"
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
                <div class="space-y-6">
                    <!-- Language overview -->
                    <LCard title="Translation coverage" :icon="GlobeEuropeAfricaIcon">
                        <div
                            v-if="translationProgress.length === 0"
                            class="py-4 text-center text-sm text-zinc-400"
                        >
                            No languages configured.
                        </div>
                        <ul v-else class="space-y-3">
                            <li v-for="lang in translationProgress" :key="lang.id">
                                <div class="flex items-center justify-between text-sm">
                                    <span
                                        class="font-medium"
                                        :class="
                                            lang.isCurrent ? 'text-yellow-600' : 'text-zinc-700'
                                        "
                                    >
                                        {{ lang.name }}
                                        <span class="text-xs text-zinc-400">
                                            ({{ lang.languageCode }})
                                        </span>
                                    </span>
                                    <span class="text-xs tabular-nums text-zinc-500">
                                        {{ contentCountPerLanguage[lang.id] ?? 0 }}
                                    </span>
                                </div>
                                <div
                                    class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
                                >
                                    <div
                                        class="h-full rounded-full transition-all"
                                        :class="lang.isCurrent ? 'bg-yellow-500' : 'bg-zinc-300'"
                                        :style="{
                                            width:
                                                maxContentCount > 0
                                                    ? `${((contentCountPerLanguage[lang.id] ?? 0) / maxContentCount) * 100}%`
                                                    : '0%',
                                        }"
                                    />
                                </div>
                            </li>
                        </ul>
                    </LCard>

                    <!-- Missing translations -->
                    <LCard
                        v-if="missingTranslations.length > 0"
                        title="Needs translation"
                        :icon="PencilSquareIcon"
                        collapsible
                    >
                        <ul class="divide-y divide-zinc-100">
                            <li
                                v-for="item in missingTranslations"
                                :key="item.parentId"
                                class="py-2"
                            >
                                <div class="flex items-center justify-between gap-2">
                                    <RouterLink
                                        v-if="parentRoute(item)"
                                        :to="parentRoute(item)!"
                                        class="min-w-0 truncate text-sm text-zinc-900 hover:text-yellow-600"
                                    >
                                        {{ item.title }}
                                    </RouterLink>
                                    <span v-else class="min-w-0 truncate text-sm text-zinc-900">
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
                    </LCard>
                </div>
            </div>
        </div>
    </BasePage>
</template>
