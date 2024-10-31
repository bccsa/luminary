<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { ref, watch } from "vue";
import { type ContentDto, DocType, db } from "luminary-shared";
import { useAuth0 } from "@auth0/auth0-vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "./HomePagePinned.vue";
import HomePageUnpinned from "./HomePageUnpinned.vue";

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

const newest10Content = db.toRef<ContentDto[]>(
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
            .limit(10) // Limit to the newest posts
            .toArray() as unknown as Promise<ContentDto[]>,
    await db.getQueryCache<ContentDto[]>("homepage_newestContent"),
);

watch(newest10Content, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_newestContent", value);
});
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
        <HorizontalContentTileCollection
            :contentDocs="newest10Content"
            title="Newest"
            :showPublishDate="true"
        />
        <HomePagePinned />
        <HomePageUnpinned />
    </IgnorePagePadding>
</template>
