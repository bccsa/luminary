<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import DashboardHeader from "@/components/dashboard/DashboardHeader.vue";
import DashboardStatCards from "@/components/dashboard/DashboardStatCards.vue";
import LanguageCoverageCard from "@/components/dashboard/LanguageCoverageCard.vue";
import DashboardStatusBanners from "@/components/dashboard/DashboardStatusBanners.vue";
import RecentActivityCard from "@/components/dashboard/RecentActivityCard.vue";
import ScheduledContentCard from "@/components/dashboard/ScheduledContentCard.vue";
import MissingTranslationsCard from "@/components/dashboard/MissingTranslationsCard.vue";
import {
    db,
    DocType,
    PublishStatus,
    useDexieLiveQuery,
    useDexieLiveQueryWithDeps,
    type ContentDto,
    type PostDto,
    type TagDto,
    type GroupDto,
    type LocalChangeDto,
} from "luminary-shared";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import { computed } from "vue";

// --- Shared data queries ---

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

// --- Derived content lists shared across cards ---

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
</script>

<template>
    <BasePage title="Dashboard" :should-show-page-title="false" is-full-width>
        <div class="flex flex-col gap-3 p-3 sm:p-4 lg:h-full lg:min-h-0">
            <DashboardHeader />

            <DashboardStatCards
                :posts="posts"
                :tags="tags"
                :groups="groups"
                :content-docs="contentDocs"
                :scheduled-content="scheduledContent"
                :expired-content="expiredContent"
            />

            <!-- Language coverage (mobile only) -->
<<<<<<< HEAD
            <LCard title="Language coverage" :icon="GlobeEuropeAfricaIcon" class="lg:hidden">
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
                        <div class="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
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
=======
            <LanguageCoverageCard
                title="Language coverage"
                :all-content-docs="allContentDocs"
                class="lg:hidden"
            />
>>>>>>> cb2c359f (Refactor DashboardPage)

            <DashboardStatusBanners
                :pending-changes="pendingChanges"
                :expired-content="expiredContent"
            />

            <!-- Main content grid -->
            <div class="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
                <!-- Recent activity (2/3 width) -->
                <div class="flex flex-col gap-3 lg:col-span-2 lg:min-h-0">
<<<<<<< HEAD
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
                                class="rounded-lg p-1.5 hover:bg-zinc-100"
                            >
                                <RouterLink
                                    class="grid grid-cols-[auto_1fr_auto_auto] items-center sm:grid-cols-[20px_1fr_150px_100px_80px]"
                                    :to="parentRoute(doc)!"
                                >
                                    <component
                                        :is="
                                            doc.parentType === DocType.Post
                                                ? DocumentTextIcon
                                                : TagIcon
                                        "
                                        class="h-4 w-4 shrink-0 text-zinc-300"
                                    />
                                    <span
                                        v-if="parentRoute(doc)"
                                        class="min-w-0 truncate text-sm font-medium text-zinc-900 hover:text-yellow-600"
                                    >
                                        {{ doc.title || "Untitled" }}
                                    </span>
                                    <span
                                        v-else
                                        class="min-w-0 truncate text-sm font-medium text-zinc-900"
                                    >
                                        {{ doc.title || "Untitled" }}
                                    </span>
                                    <span
                                        v-if="doc.author"
                                        class="hidden truncate text-right text-xs text-zinc-400 sm:col-start-3 sm:inline"
                                    >
                                        by {{ doc.author }}
                                    </span>
                                    <div v-else class="hidden sm:col-start-3 sm:block"></div>
                                    <span class="text-right text-xs text-zinc-400 sm:col-start-4">
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
                                        class="justify-self-end sm:col-start-5"
                                    >
                                        {{ doc.status }}
                                    </LBadge>
                                </RouterLink>
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
=======
                    <RecentActivityCard :content-docs="contentDocs" />
                    <ScheduledContentCard :scheduled-content="scheduledContent" />
>>>>>>> cb2c359f (Refactor DashboardPage)
                </div>

                <!-- Right column (1/3 width) -->
                <div class="flex flex-col gap-3 lg:min-h-0">
                    <LanguageCoverageCard
                        title="Translation coverage"
                        :all-content-docs="allContentDocs"
                        class="max-lg:hidden"
<<<<<<< HEAD
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
                                        class="rounded-lg p-1.5 hover:bg-zinc-100"
                                    >
                                        <RouterLink
                                            :to="parentRoute(item)!"
                                            class="min-w-0 truncate text-sm text-zinc-900 hover:text-yellow-600"
                                        >
                                            <div class="flex items-center justify-between gap-2">
                                                <span v-if="parentRoute(item)">
                                                    {{ item.title }}
                                                </span>
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
                                        </RouterLink>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </LCard>
=======
                    />
                    <MissingTranslationsCard :all-content-docs="allContentDocs" />
>>>>>>> cb2c359f (Refactor DashboardPage)
                </div>
            </div>
        </div>
    </BasePage>
</template>
