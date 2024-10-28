<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { computed, ref, watch, watchEffect, type Ref } from "vue";
import { type ContentDto, DocType, TagType, db } from "luminary-shared";
import { useAuth0 } from "@auth0/auth0-vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";

type ContentByCategory = {
    category: ContentDto;
    latestContentDate: number;
    content: Array<ContentDto>;
};

/**
 * Sort content by category
 * @param content
 * @param categories
 * @returns a Vue ref of ContentByCategory[]
 */
const contentByCategory = (
    content: Ref<ContentDto[]>,
    categories: Ref<ContentDto[]>,
): Ref<ContentByCategory[]> => {
    const result = ref<ContentByCategory[]>([]);

    watchEffect(() => {
        categories.value.forEach((category) => {
            const sorted = content.value
                .filter((c) => c.publishDate && c.parentTags.includes(category.parentId))
                .sort((a, b) => {
                    if (!a.publishDate) return 1;
                    if (!b.publishDate) return -1;
                    if (a.publishDate < b.publishDate) return -1;
                    if (a.publishDate > b.publishDate) return 1;
                    return 0;
                });

            if (sorted.length) {
                const index = result.value.findIndex((r) => r.category._id === category._id);
                // Replace the category if it already exists. For some or other reason the categories are
                // duplicated on initial page load, and this logic prevents showing duplicate categories.
                if (index !== -1) {
                    result.value[index] = {
                        category,
                        latestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    };
                } else {
                    result.value.push({
                        category,
                        latestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    });

                    result.value.sort((a, b) => {
                        if (a.latestContentDate > b.latestContentDate) return -1;
                        if (a.latestContentDate < b.latestContentDate) return 1;
                        return 0;
                    });
                }
            }
        });
    });

    return result;
};

const { isAuthenticated } = useAuth0();

const hasPosts = db.toRef<boolean>(
    () =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageIdAsRef.value,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .first()
            .then((c) => c != undefined),
    true,
);

const noContentMessageDelay = ref(false);
setTimeout(() => {
    noContentMessageDelay.value = true;
}, 3000);

const newestContent = db.toRef<ContentDto[]>(
    () =>
        db.docs
            .orderBy("publishDate")
            .reverse()
            .filter((c) => {
                const content = c as ContentDto;
                if (content.type !== DocType.Content) return false;
                if (content.language !== appLanguageIdAsRef.value) return false;

                // Only include published content
                if (content.status !== "published") return false;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .limit(100) // Limit to the newest posts
            .toArray() as unknown as Promise<ContentDto[]>,
    [],
);

const newest10Content = computed(() => newestContent.value.slice(0, 10));

// Get all pinned categories
// =========================

// Get pinned categories' content docs
const pinnedCategories = db.toRef<ContentDto[]>(
    () =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageIdAsRef.value,
                status: "published",
                parentPinned: 1,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    [],
);

// Map tag IDs of pinned categories
const pinnedCategoryIds = computed(() => {
    if (!pinnedCategories.value || !pinnedCategories.value.length) return [];
    return pinnedCategories.value.map((c) => c.parentId);
});

// Get content tagged with pinned categories
const pinnedCategoryContent = ref<ContentDto[]>([]);
watch(pinnedCategoryIds, async (ids) => {
    pinnedCategoryContent.value = await (db.docs
        .where({
            type: DocType.Content,
            language: appLanguageIdAsRef.value,
            status: "published",
        })
        .filter((c) => {
            const content = c as ContentDto;
            if (!content.publishDate) return false;
            if (content.publishDate > Date.now()) return false;
            if (content.expiryDate && content.expiryDate < Date.now()) return false;

            for (const tagId of content.parentTags) {
                if (ids.includes(tagId)) return true;
            }
            return false;
        })
        .toArray() as unknown as Promise<ContentDto[]>);
});

// sort pinned content by category
const pinnedContentByCategory = contentByCategory(pinnedCategoryContent, pinnedCategories);

// Get all unpinned categories
// ===========================
const newestUnpinnedTagIds = computed(() => {
    if (!newestContent.value.length) return [];

    return newestContent.value
        .map((content) => content.parentTags)
        .flat()
        .filter((value, index, array) => {
            return array.indexOf(value) === index;
        });
});

const categoriesNewestUnpinnedContent = ref<ContentDto[]>([]); // The unpinned categories of the newest content
watch(newestUnpinnedTagIds, async (ids) => {
    categoriesNewestUnpinnedContent.value = await (db.docs
        .where("parentId")
        .anyOf(ids)
        .filter((content) => {
            const _content = content as ContentDto;
            if (_content.parentType !== DocType.Tag) return false;
            if (!_content.parentTagType) return false;
            if (!_content.publishDate) return false;
            if (_content.publishDate > Date.now()) return false;
            if (_content.expiryDate && _content.expiryDate < Date.now()) return false;
            if (_content.parentPinned) return false;
            return (
                _content.parentTagType == TagType.Category &&
                _content.language === appLanguageIdAsRef.value
            );
        })
        .toArray() as unknown as Promise<ContentDto[]>);
});

const unpinnedNewestContentByCategory = contentByCategory(
    newestContent,
    categoriesNewestUnpinnedContent,
);
</script>

<template>
    <div v-if="!hasPosts" class="text-zinc-800 dark:text-slate-100">
        <div v-if="isAuthenticated">
            <p>
                You don't have access to any content. If you believe this is an error, send your
                contact person a message.
            </p>
        </div>
        <div v-else>
            <div v-if="noContentMessageDelay">
                <p>There is currently no content available.</p>

                <p class="mt-1">
                    Please
                    <router-link
                        :to="{ name: 'login' }"
                        class="text-yellow-600 underline hover:text-yellow-500"
                        >log in </router-link
                    >if you have an account.
                </p>
            </div>
        </div>
    </div>
    <IgnorePagePadding v-else>
        <!-- newest -->
        <HorizontalContentTileCollection
            :contentDocs="newest10Content"
            title="Newest"
            :showPublishDate="true"
        />

        <!-- pinned -->
        <HorizontalContentTileCollection
            v-for="c in pinnedContentByCategory"
            :key="c.category._id"
            :contentDocs="c.content"
            :title="c.category.title"
            :summary="c.category.summary"
            :showPublishDate="false"
            class="bg-yellow-500/10 pb-3 pt-4 dark:bg-yellow-500/5"
        />

        <!-- unpinned -->
        <HorizontalContentTileCollection
            v-for="c in unpinnedNewestContentByCategory"
            :key="c.category._id"
            :contentDocs="c.content"
            :title="c.category.title"
            :summary="c.category.summary"
            class="pt-4"
        />
    </IgnorePagePadding>
</template>
