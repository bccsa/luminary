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
    useHybridQuery,
    type ContentDto,
    type PostDto,
    type TagDto,
    type GroupDto,
    type LocalChangeDto,
} from "luminary-shared";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import { useDocsByType } from "@/composables/useDocsByType";
import { computed } from "vue";

// --- Shared data queries ---

const posts = useHybridQuery<PostDto>(() => ({
    selector: { type: DocType.Post },
}));

const tags = useHybridQuery<TagDto>(() => ({
    selector: { type: DocType.Tag },
}));

const groups = useDocsByType<GroupDto>(DocType.Group);

const allContentDocs = useHybridQuery<ContentDto>(() => ({
    selector: { type: DocType.Content },
}));

const contentDocs = useHybridQuery<ContentDto>(() => ({
    selector: { type: DocType.Content, language: cmsLanguageIdAsRef.value },
}));

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
            <LanguageCoverageCard
                title="Language coverage"
                :all-content-docs="allContentDocs"
                class="lg:hidden"
            />

            <DashboardStatusBanners
                :pending-changes="pendingChanges"
                :expired-content="expiredContent"
            />

            <!-- Main content grid -->
            <div class="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
                <!-- Recent activity (2/3 width) -->
                <div class="flex flex-col gap-3 lg:col-span-2 lg:min-h-0">
                    <RecentActivityCard :content-docs="contentDocs" />
                    <ScheduledContentCard :scheduled-content="scheduledContent" />
                </div>

                <!-- Right column (1/3 width) -->
                <div class="flex flex-col gap-3 lg:min-h-0">
                    <LanguageCoverageCard
                        title="Translation coverage"
                        :all-content-docs="allContentDocs"
                        class="max-lg:hidden"
                    />
                    <MissingTranslationsCard :all-content-docs="allContentDocs" />
                </div>
            </div>
        </div>
    </BasePage>
</template>
